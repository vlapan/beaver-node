const childProcess = require('child_process');

const async = require('async');
const acme = require('acme-client');
const forge = require('node-forge');
const debug = require('debug')('beaver:daemons:acme:worker');

const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));

function shutdown() {
    process.exit();
}
process.on('disconnect', shutdown);

async function challengeCreateFn(acmeWebPath, authz, challenge, keyAuthorization) {
    debug('triggered challengeCreateFn()');
    debug(`type: ${challenge.type}`);
    if (challenge.type === 'http-01') {
        const filePath = `${acmeWebPath}/.well-known/acme-challenge/${challenge.token}`;
        const fileContents = keyAuthorization;
        debug(`creating challenge response for ${authz.identifier.value} at path: ${filePath}`);
        debug(`would write "${fileContents}" to path "${filePath}"`);
        try {
            await fs.writeFileAsync(filePath, fileContents);
        } catch (e) {
            debug(`error: ${e}`);
        }
    } else if (challenge.type === 'dns-01') {
        const dnsRecord = `_acme-challenge.${authz.identifier.value}`;
        const recordValue = keyAuthorization;
        debug(`creating TXT record for ${authz.identifier.value}: ${dnsRecord}`);
        debug(`would create TXT record "${dnsRecord}" with value "${recordValue}"`);
        // await dnsProvider.createRecord(dnsRecord, 'TXT', recordValue);
    }
}

async function challengeRemoveFn(acmeWebPath, authz, challenge, keyAuthorization) {
    debug('triggered challengeRemoveFn()');
    if (challenge.type === 'http-01') {
        const filePath = `${acmeWebPath}/.well-known/acme-challenge/${challenge.token}`;
        debug(`removing challenge response for ${authz.identifier.value} at path: ${filePath}`);
        debug(`would remove file on path "${filePath}"`);
        try {
            await fs.unlinkAsync(filePath);
        } catch (e) {
            debug(`error: ${e}`);
        }
    } else if (challenge.type === 'dns-01') {
        const dnsRecord = `_acme-challenge.${authz.identifier.value}`;
        const recordValue = keyAuthorization;
        debug(`removing TXT record for ${authz.identifier.value}: ${dnsRecord}`);
        debug(`would remove TXT record "${dnsRecord}" with value "${recordValue}"`);
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
        debug(`account.key: ${accountKey}, account: ${JSON.stringify(account, null, 4)}`);
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

        const accountEmailPath = `${accountPath}/account-email`;

        let accountChange = true;

        if (fs.existsSync(accountEmailPath)) {
            const accountEmail = fs.readFileSync(accountEmailPath);
            if (accountEmail === account.email) {
                accountChange = false;
            }
        }

        if (accountChange) {
            try {
                const createAccount = await client.createAccount({
                    termsOfServiceAgreed: true,
                    contact: account.email ? [`mailto:${account.email}`] : []
                });
                debug(`account.create: ${createAccount}`);
                try {
                    const updateAccount = await client.updateAccount({
                        termsOfServiceAgreed: true,
                        contact:  account.email ? [`mailto:${account.email}`] : []
                    });
                    debug(`account.update: ${updateAccount}`);
                    fs.writeFileSync(accountEmailPath, account.email);
                } catch (e) {
                    debug(`account.update: error: ${e}`);
                }
            } catch (e) {
                debug(`account.update: error: ${e}`);
            }
        }

        for (let i = 0, till = account.domains.length; i < till; i++) {
            const domain = account.domains[i];
            debug(`account.domain: ${domain}`);
            const pathPrefix = `${workdirPath}/host-${domain.commonName}`;
            const keyPath = `${pathPrefix}.key`;
            const crtPath = `${pathPrefix}.crt`;

            if (fs.existsSync(crtPath)) {
                const cert = forge.pki.certificateFromPem(fs.readFileSync(crtPath));
                const expiry = cert.validity.notAfter;
                const remainingTime = expiry.getTime() - Date.now();
                const remainingDays = remainingTime / (1000 * 60 * 60 * 24);
                const expired = remainingDays < 30;
                debug(`certificate: ${crtPath}: expiry: valid for: ${remainingDays | 0} days`);
                if (!expired) {
                    continue;
                }
            }

            const csrPath = `${pathPrefix}.csr`;
            if (!fs.existsSync(csrPath)) {
                continue;
            }
            const csr = fs.readFileSync(csrPath);

            try {
                const cert = await client.auto({
                    csr,
                    email: account.email,
                    termsOfServiceAgreed: true,
                    challengeCreateFn: challengeCreateFn.bind(null, acmeWebPath),
                    challengeRemoveFn: challengeRemoveFn.bind(null, acmeWebPath),
                });

                debug(`would write '${domain.commonName}' certificate to path '${crtPath}'`);
                fs.writeFileSync(crtPath, cert.toString());

                debug(`would export key and certificate to '${workdirPath}'`);
                fs.copyFileSync(crtPath, `${exportPath}/host-${domain.commonName}.crt`);
                fs.copyFileSync(keyPath, `${exportPath}/host-${domain.commonName}.key`);
                fs.writeFileSync(`${accountPath}/serial`, `${(new Date()).toISOString()} ${account.master} ${accountKey}`);

                const hookPath = `${acmePath}/hook`;
                if (fs.existsSync(hookPath)) {
                    debug(`executing hook: ${hookPath}`);
                    const hookResult = childProcess.spawnSync(hookPath);
                    if (hookResult.stdout) {
                        debug(`hook stdout: ${hookResult.stdout}`);
                    }
                    if (hookResult.status > 0) {
                        debug(`hook status: ${hookResult.status}`);
                        if (hookResult.stderr) {
                            debug(`hook stderr: ${hookResult.stderr}`);
                        }
                    }
                }
                changed[accountKey] = true;
            } catch (e) {
                debug(`error: ${e}`);
            }
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
