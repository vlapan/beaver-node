const childProcess = require('child_process');

const async = require('async');
const acme = require('acme-client');
const forge = require('node-forge');

const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));

function shutdown() {
    process.exit();
}
process.on('disconnect', shutdown);

function log(m) {
    process.stdout.write(`${m}\n`);
}

async function challengeCreateFn(acmeWebPath, authz, challenge, keyAuthorization) {
    log('acme worker: triggered challengeCreateFn()');
    log(challenge.type);
    if (challenge.type === 'http-01') {
        const filePath = `${acmeWebPath}/.well-known/acme-challenge/${challenge.token}`;
        const fileContents = keyAuthorization;
        log(`acme worker: creating challenge response for ${authz.identifier.value} at path: ${filePath}`);
        log(`acme worker: would write "${fileContents}" to path "${filePath}"`);
        await fs.writeFileAsync(filePath, fileContents);
    } else if (challenge.type === 'dns-01') {
        const dnsRecord = `_acme-challenge.${authz.identifier.value}`;
        const recordValue = keyAuthorization;
        log(`acme worker: creating TXT record for ${authz.identifier.value}: ${dnsRecord}`);
        log(`acme worker: would create TXT record "${dnsRecord}" with value "${recordValue}"`);
        // await dnsProvider.createRecord(dnsRecord, 'TXT', recordValue);
    }
}

async function challengeRemoveFn(acmeWebPath, authz, challenge, keyAuthorization) {
    log('acme worker: triggered challengeRemoveFn()');
    if (challenge.type === 'http-01') {
        const filePath = `${acmeWebPath}/.well-known/acme-challenge/${challenge.token}`;
        log(`acme worker: removing challenge response for ${authz.identifier.value} at path: ${filePath}`);
        log(`acme worker: would remove file on path "${filePath}"`);
        await fs.unlinkAsync(filePath);
    } else if (challenge.type === 'dns-01') {
        const dnsRecord = `_acme-challenge.${authz.identifier.value}`;
        const recordValue = keyAuthorization;
        log(`acme worker: removing TXT record for ${authz.identifier.value}: ${dnsRecord}`);
        log(`acme worker: would remove TXT record "${dnsRecord}" with value "${recordValue}"`);
        // await dnsProvider.removeRecord(dnsRecord, 'TXT');
    }
}

async function parse(config) {
    if (typeof config !== 'object') {
        process.send({
            error: 'no config',
        }, shutdown);
        return;
    }

    const changed = {};

    const acmePath = config.path;
    if (!fs.existsSync(acmePath)) {
        fs.mkdirSync(acmePath);
    }
    const accountsPath = `${acmePath}/accounts`
    if (!fs.existsSync(accountsPath)) {
        fs.mkdirSync(accountsPath);
    }
    const acmeWebPath = `${acmePath}/www`;
    if (!fs.existsSync(acmeWebPath)) {
        fs.mkdirSync(acmeWebPath);
    }

    for (const [accountKey, account] of Object.entries(config.accounts)) {
        if (account.master !== config.hostname) {
            continue;
        }
        console.log(accountKey, account);
        const accountPath = `${accountsPath}/${accountKey}`
        if (!fs.existsSync(accountPath)) {
            fs.mkdirSync(accountPath);
        }
        const workdirPath = `${accountPath}/workdir`
        if (!fs.existsSync(workdirPath)) {
            fs.mkdirSync(workdirPath);
        }
        const exportPath = `${accountPath}/export`
        if (!fs.existsSync(exportPath)) {
            fs.mkdirSync(exportPath);
        }
        const privateKey = fs.readFileSync(`${accountPath}/acme-account.key`);
        const directoryUrl = account.provider === 'letsencrypt' ? acme.directory.letsencrypt.production : acme.directory.letsencrypt.staging;
        const client = new acme.Client({
            directoryUrl,
            accountKey: privateKey,
        });
        for (let i = 0, till = account.domains.length; i < till; i++) {
            const domain = account.domains[i];
            console.log(domain);
            const pathPrefix = `${workdirPath}/host-${domain.commonName}`;
            const keyPath = `${pathPrefix}.key`;
            const crtPath = `${pathPrefix}.crt`;

            if (fs.existsSync(crtPath)) {
                const cert = forge.pki.certificateFromPem(fs.readFileSync(crtPath));
                const expiry = cert.validity.notAfter;
                const remainingTime = expiry.getTime() - Date.now();
                const remainingDays = remainingTime / (1000 * 60 * 60 * 24);
                const expired = remainingDays < 30;
                log(`acme worker: certificate: ${crtPath}: expiry: valid for: ${remainingDays | 0} days`);
                if (!expired) {
                    continue;
                }
            }

            const csrPath = `${pathPrefix}.csr`;
            if (!fs.existsSync(csrPath)) {
                continue;
            }
            const csr = fs.readFileSync(csrPath);
            const cert = await client.auto({
                csr,
                email: account.email,
                termsOfServiceAgreed: true,
                challengeCreateFn: challengeCreateFn.bind(null, acmeWebPath),
                challengeRemoveFn: challengeRemoveFn.bind(null, acmeWebPath),
            });
            // log(`Certificate:\n${cert.toString()}`);
            log(`acme worker: would write '${domain.commonName}' certificate to path '${crtPath}'`);
            fs.writeFileSync(crtPath, cert.toString());

            log(`acme worker: would export key and certificate to '${workdirPath}'`);
            fs.copyFileSync(crtPath, `${exportPath}/host-${domain.commonName}.crt`);
            fs.copyFileSync(keyPath, `${exportPath}/host-${domain.commonName}.key`);
            fs.writeFileSync(`${accountPath}/serial`, `${(new Date()).toISOString()} ${account.master} ${accountKey}`, null, 4);

            const hookPath = `${acmePath}/hook`;
            if (fs.existsSync(hookPath)) {
                log(`acme worker: executing hook: ${hookPath}`);
                const hookResult = childProcess.spawnSync(hookPath);
                if (hookResult.stdout) {
                    log(`acme worker: hook stdout: ${hookResult.stdout}`);
                }
                if (hookResult.status > 0) {
                    log(`acme worker: hook status: ${hookResult.status}`);
                    if (hookResult.stderr) {
                        log(`acme worker: hook stderr: ${hookResult.stderr}`);
                    }
                }
            }
            changed[accountKey] = true;
        };
    }


    process.send({
        result: Object.keys(changed),
    }, shutdown);

    // if (!config.tests.length) {
    //     process.send({
    //         error: 'no tests',
    //     }, shutdown);
    //     return;
    // }

    // const tasks = [];

    // config.tests.forEach((service) => {
    //     tasks.push(function (callback) {
    //         console.log('asdfdsaf');
    //         callback(null, true);
    //     });
    // });
    // async.parallel(tasks, (err, result) => {
    //     if (!process.connected) {
    //         shutdown();
    //     }
    //     if (err) {
    //         process.send({
    //             error: err,
    //         }, shutdown);
    //     } else {
    //         process.send({
    //             result,
    //         }, shutdown);
    //     }
    // });
}

process.on('message', parse);
