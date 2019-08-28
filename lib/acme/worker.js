const async = require('async');
const acme = require('acme-client');

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
    log('Triggered challengeCreateFn()');
    log(challenge.type);
    if (challenge.type === 'http-01') {
        const filePath = `${acmeWebPath}/.well-known/acme-challenge/${challenge.token}`;
        const fileContents = keyAuthorization;
        log(`Creating challenge response for ${authz.identifier.value} at path: ${filePath}`);
        log(`Would write "${fileContents}" to path "${filePath}"`);
        await fs.writeFileAsync(filePath, fileContents);
    } else if (challenge.type === 'dns-01') {
        const dnsRecord = `_acme-challenge.${authz.identifier.value}`;
        const recordValue = keyAuthorization;
        log(`Creating TXT record for ${authz.identifier.value}: ${dnsRecord}`);
        log(`Would create TXT record "${dnsRecord}" with value "${recordValue}"`);
        // await dnsProvider.createRecord(dnsRecord, 'TXT', recordValue);
    }
}

async function challengeRemoveFn(acmeWebPath, authz, challenge, keyAuthorization) {
    log('Triggered challengeRemoveFn()');
    if (challenge.type === 'http-01') {
        const filePath = `${acmeWebPath}/.well-known/acme-challenge/${challenge.token}`;
        log(`Removing challenge response for ${authz.identifier.value} at path: ${filePath}`);
        log(`Would remove file on path "${filePath}"`);
        await fs.unlinkAsync(filePath);
    } else if (challenge.type === 'dns-01') {
        const dnsRecord = `_acme-challenge.${authz.identifier.value}`;
        const recordValue = keyAuthorization;
        log(`Removing TXT record for ${authz.identifier.value}: ${dnsRecord}`);
        log(`Would remove TXT record "${dnsRecord}" with value "${recordValue}"`);
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

    console.log(config);

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
        console.log(accountKey, account);
        const accountPath = `${accountsPath}/${accountKey}`
        if (!fs.existsSync(accountPath)) {
            fs.mkdirSync(accountPath);
        }
        const privateKey = fs.readFileSync(`${accountPath}/acme-account.key`);
        const client = new acme.Client({
            directoryUrl: acme.directory.letsencrypt.staging,
            accountKey: privateKey,
        });
        for (let i = 0, till = account.domains.length; i < till; i++) {
            const domain = account.domains[i];
            console.log(domain);
            const pathPrefix = `${accountPath}/host-${domain.commonName}`;
            const crtPath = `${pathPrefix}.crt`
            const csrPath = `${pathPrefix}.csr`
            const csr = fs.readFileSync(csrPath);
            const cert = await client.auto({
                csr,
                email: account.email,
                termsOfServiceAgreed: true,
                challengeCreateFn: challengeCreateFn.bind(null, acmeWebPath),
                challengeRemoveFn: challengeRemoveFn.bind(null, acmeWebPath),
            });
            log(`Certificate:\n${cert.toString()}`);
            fs.writeFileSync(crtPath, cert.toString());
        };
    }

    process.send({
        result: 0,
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
