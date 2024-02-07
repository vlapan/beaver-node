const fs = require('fs');
const childProcess = require('child_process');

const acme = require('acme-client');
const debug = require('debug')('beaver:daemons:acme:worker');
const dnsPromises = require('dns').promises;

const { checkExpired, getRemainingDays, checkMigrate, getZone } = require('./utils');

const { sleep, retryable, endsWithAny } = require('../utils');
const { mkdirSafe, checkFileExists } = require('../utils/fs');
const getHash = require('../utils/hash');

function shutdown() {
    process.exit();
}
process.on('disconnect', shutdown);

async function runHook(hookPath) {
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

let timeoutId;
const deferList = [];
function saveDNS(cb) {
    debug('SaveDNS.func.start');
    const p = new Promise((resolve, reject) => deferList.push([resolve, reject]));
    clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
        debug('SaveDNS.timeout.cb()');
        try {
            await cb();
            debug('SaveDNS.timeout.resolveAll()');
            deferList.map((p) => p[0]());
        } catch (e) {
            debug(`SaveDNS.timeout.cb.error: ${e}`);
            debug('SaveDNS.timeout.rejectAll()');
            deferList.map((p) => p[1](e));
        }
    }, 1000);
    return p;
}

let records = {};

async function challengeCreateFn(options, authz, challenge, keyAuthorization) {
    debug('triggered challengeCreateFn()');
    debug(`type: ${challenge.type}`);
    if (challenge.type === 'http-01') {
        const filePath = `${options.acmeWebPath}/.well-known/acme-challenge/${challenge.token}`;
        const fileContents = keyAuthorization;
        debug(`creating challenge response for ${authz.identifier.value} at path: ${filePath}`);
        debug(`would write "${fileContents}" to path "${filePath}"`);
        await fs.promises.writeFile(filePath, fileContents);
    } else if (challenge.type === 'dns-01') {
        const dnsRecord = `_acme-challenge.${authz.identifier.value}`;
        const recordValue = keyAuthorization;
        const hookPath = `${options.acmePath}/hook-publish-named`;
        if (!await checkFileExists(hookPath)) {
            throw new Error(`hook(${hookPath}) not found`);
        }
        debug(`creating TXT record for ${authz.identifier.value}: ${dnsRecord}`);
        debug(`would create TXT record "${dnsRecord}" with value "${recordValue}"`);
        if (!Array.isArray(records[dnsRecord])) {
            records[dnsRecord] = [recordValue];
        } else {
            records[dnsRecord].push(recordValue);
        }
        await saveDNS(async () => {
            const promises = [];
            for (const [key, value] of Object.entries(records)) {
                if (endsWithAny(key, options.masterDomains || [])) {
                    const zoneFilePath = `${options.acmeDnsPath}/${key}.dns`;
                    promises.push(fs.promises.writeFile(zoneFilePath, getZone(key, options.dns.mname, options.dns.rname, [options.master], value)));
                }
                if (options.mirrorDomainSuffix) {
                    const zoneMirrorKey = `${key}.${options.mirrorDomainSuffix}`;
                    const zoneMirrorFilePath = `${options.acmeDnsPath}/${zoneMirrorKey}.dns`;
                    debug(`found mirrorDomainSuffix: ${options.mirrorDomainSuffix} ${zoneMirrorFilePath}`);
                    promises.push(fs.promises.writeFile(zoneMirrorFilePath, getZone(zoneMirrorKey, options.dns.mname, options.dns.rname, [options.master], value)));
                }
            }
            await Promise.all(promises);
            await runHook(hookPath);
            await sleep(5000);
            for (const [key, value] of Object.entries(records)) {
                debug(`check: NS servers(${options.dns.ns}), domain "${key}", TXT records should include "${value}"`);
                for (const ns of options.dns.ns) {
                    debug(`check:${ns}: resolving...`);
                    const resolver = new dnsPromises.Resolver();
                    const nsAddrList = await resolver.resolve(ns);
                    debug(`check:${ns}: resolved A: ${nsAddrList}`);
                    for (const nsAddr of nsAddrList) {
                        resolver.setServers([nsAddr]);
                        await retryable(async () => {
                            const txtArr = (await resolver.resolveTxt(key)).map((x) => x.join(' '));
                            debug(`check:${ns}:${nsAddr}: domain "${key}", resolved TXT: ${txtArr}`);
                            for (const record of value) {
                                const includes = txtArr.includes(record);
                                if (includes) {
                                    continue;
                                }
                                debug(`check:${ns}:${nsAddr}: ${includes} === ${JSON.stringify(txtArr)}.includes(${JSON.stringify(record)})`);
                                throw new Error(`NS: ${ns}/${nsAddr}, domain "${key}", no key(${record}) in TXT(${txtArr})`);
                            }
                        }, {
                            maxAttempts: 15,
                            debug,
                        });
                    }
                }
                const resolverLocal = new dnsPromises.Resolver();
                await retryable(async () => {
                    const txtArr = (await resolverLocal.resolveTxt(key)).map((x) => x.join(' '));
                    debug(`check:local: domain "${key}", resolved TXT: ${txtArr}`);
                    for (const record of value) {
                        const includes = txtArr.includes(record);
                        if (includes) {
                            continue;
                        }
                        debug(`check:local: ${includes} === ${JSON.stringify(txtArr)}.includes(${JSON.stringify(record)})`);
                        throw new Error(`NS: local, domain "${key}", no key(${record}) in TXT(${txtArr})`);
                    }
                }, {
                    maxAttempts: 15,
                    debug,
                });
            }
        });
    }
    debug('challengeCreateFn.end');
}

async function challengeRemoveFn(options, authz, challenge, keyAuthorization) {
    debug('triggered challengeRemoveFn()');
    if (challenge.type === 'http-01') {
        const filePath = `${options.acmeWebPath}/.well-known/acme-challenge/${challenge.token}`;
        debug(`removing challenge response for ${authz.identifier.value} at path: ${filePath}`);
        debug(`would remove file on path "${filePath}"`);
        await fs.promises.unlink(filePath);
    } else if (challenge.type === 'dns-01') {
        const dnsRecord = `_acme-challenge.${authz.identifier.value}`;
        const recordValue = keyAuthorization;
        const hookPath = `${options.acmePath}/hook-publish-named`;
        if (!await checkFileExists(hookPath)) {
            throw new Error(`hook(${hookPath}) not found`);
        }
        debug(`removing TXT record for ${authz.identifier.value}: ${dnsRecord}`);
        debug(`would remove TXT record "${dnsRecord}" with value "${recordValue}"`);
        if (!Array.isArray(records[dnsRecord])) {
            records[dnsRecord] = [];
        } else {
            records[dnsRecord] = records[dnsRecord].filter((x) => x !== recordValue);
        }
        await saveDNS(async () => {
            const promises = [];
            for (const [key, value] of Object.entries(records)) {
                if (endsWithAny(key, options.masterDomains || [])) {
                    const zoneFilePath = `${options.acmeDnsPath}/${key}.dns`;
                    promises.push(fs.promises.writeFile(zoneFilePath, getZone(key, options.dns.mname, options.dns.rname, [options.master], value)));
                }
                if (options.mirrorDomainSuffix) {
                    const zoneMirrorKey = `${key}.${options.mirrorDomainSuffix}`;
                    const zoneMirrorFilePath = `${options.acmeDnsPath}/${zoneMirrorKey}.dns`;
                    debug(`found mirrorDomainSuffix: ${options.mirrorDomainSuffix} ${zoneMirrorFilePath}`);
                    promises.push(fs.promises.writeFile(zoneMirrorFilePath, getZone(zoneMirrorKey, options.dns.mname, options.dns.rname, [options.master], value)));
                }
            }
            await Promise.all(promises);
            await runHook(hookPath);
            await sleep(1000);
        });
    }
    debug('challengeRemoveFn.end');
}

async function parse(config) {
    if (typeof config !== 'object') {
        process.send({
            error: 'no config',
        }, shutdown);
        return;
    }

    const updated = new Set();
    const received = {};
    const errors = {};

    const acmePath = `${process.env.BEAVER_HOME}/acme`;
    const accountsPath = `${acmePath}/accounts`;
    const acmeDnsPath = `${acmePath}/dns`;
    const acmeWebPath = `${acmePath}/www`;

    await Promise.all([
        mkdirSafe(acmePath),
        mkdirSafe(accountsPath),
        mkdirSafe(acmeDnsPath),
        mkdirSafe(acmeWebPath),
    ]);

    for (const [accountKey, account] of Object.entries(config.accounts)) {
        if (account.master !== config.hostname) {
            continue;
        }
        debug(`account.key: ${accountKey}, account: ${JSON.stringify(account, null, 4)}`);
        const accountPath = `${accountsPath}/${accountKey}`;
        const workdirPath = `${accountPath}/workdir`;
        const exportPath = `${accountPath}/export`;

        await Promise.all([
            mkdirSafe(accountPath),
            mkdirSafe(workdirPath),
            mkdirSafe(exportPath),
        ]);

        const privateKey = await fs.promises.readFile(`${accountPath}/acme-account.key`);
        const directoryUrl = account.provider === 'letsencrypt' ? acme.directory.letsencrypt.production : acme.directory.letsencrypt.staging;
        const client = new acme.Client({
            directoryUrl,
            accountKey: privateKey,
        });

        const accountEmailPath = `${accountPath}/account-email`;

        let accountChange = true;

        if (await checkFileExists(accountEmailPath)) {
            const accountEmail = await fs.promises.readFile(accountEmailPath, 'utf8');
            if (accountEmail === account.email) {
                accountChange = false;
            }
        }

        if (accountChange) {
            const contactObj = {
                termsOfServiceAgreed: true,
                contact: account.email ? [`mailto:${account.email}`] : [],
            };
            try {
                const createAccount = await client.createAccount(contactObj);
                debug(`account.create: ${JSON.stringify(createAccount, null, 4)}`);

                const updateAccount = await client.updateAccount(contactObj);
                debug(`account.update: ${JSON.stringify(updateAccount, null, 4)}`);

                await fs.promises.writeFile(accountEmailPath, account.email);
            } catch (e) {
                debug(`account.update: error: ${e}`);
            }
        }

        const expiredResult = await Promise.all([
            checkExpired(workdirPath),
            checkExpired(exportPath),
        ]);
        expiredResult.forEach((x) => x.forEach((y) => {
            updated.add(accountKey);
            debug(y);
        }));

        for (const domain of account.domains) {
            debug(`account.domain: ${JSON.stringify(domain, null, 4)}`);

            if (await checkMigrate(`${workdirPath}/host-${domain.commonName}`)) {
                updated.add(accountKey);
            }

            const hash = getHash({
                commonName: domain.commonName,
                altNames: domain.altNames,
                keySize: domain.keySize || 2048,
            });
            const pathPrefix = `${workdirPath}/host-${domain.commonName}-${hash}`;
            const keyPath = `${pathPrefix}.key`;
            const crtPath = `${pathPrefix}.crt`;

            if (await checkFileExists(crtPath)) {
                const remainingDays = await getRemainingDays(crtPath);
                const expired = remainingDays < 30;
                debug(`certificate: ${crtPath}: expiry: valid for: ${remainingDays | 0} days`);
                if (!expired) {
                    continue;
                }
            }

            const csrPath = `${pathPrefix}.csr`;
            if (!await checkFileExists(csrPath)) {
                continue;
            }
            const csr = await fs.promises.readFile(csrPath);

            const opts = {
                acmePath,
                acmeWebPath,
                acmeDnsPath,
                master: account.master,
                masterDomains: account.masterDomains,
                dns: domain.dns,
                mirrorDomainSuffix: account.mirrorDomainSuffix,
            };

            try {
                records = {};
                const cert = await client.auto({
                    csr,
                    email: account.email,
                    termsOfServiceAgreed: true,
                    challengePriority: domain.type === 'acme-dns-01' ? ['dns-01', 'http-01'] : ['http-01', 'dns-01'],
                    challengeCreateFn: challengeCreateFn.bind(null, opts),
                    challengeRemoveFn: challengeRemoveFn.bind(null, opts),
                });

                debug(`would write '${domain.commonName}' certificate to path '${crtPath}'`);
                await fs.promises.writeFile(crtPath, cert.toString());

                debug(`would export key and certificate to '${workdirPath}'`);
                await Promise.all([
                    fs.promises.copyFile(crtPath, `${exportPath}/host-${domain.commonName}.crt`),
                    fs.promises.copyFile(keyPath, `${exportPath}/host-${domain.commonName}.key`),
                    fs.promises.writeFile(`${accountPath}/serial`, `${(new Date()).toISOString()} ${account.master} ${accountKey}`),
                ]);

                const hookPath = `${acmePath}/hook-publish-nginx`;
                if (await checkFileExists(hookPath)) {
                    await runHook(hookPath);
                } else {
                    const hookOldPath = `${acmePath}/hook`;
                    if (await checkFileExists(hookOldPath)) {
                        await runHook(hookOldPath);
                    }
                }

                updated.add(accountKey);

                if (!received[accountKey]) {
                    received[accountKey] = [];
                }
                received[accountKey].push(domain.commonName);
            } catch (error) {
                debug(`error: ${error}`);
                if (!errors[accountKey]) {
                    errors[accountKey] = {};
                }
                errors[accountKey][domain.commonName] = error.message;
            }
        }
    }

    process.send({
        updated: [...updated],
        received,
        errors,
    }, shutdown);
}

process.on('message', parse);
