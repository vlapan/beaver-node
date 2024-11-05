const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').exec);
const acme = require('acme-client');
const x509 = require('@peculiar/x509');

const openssl = require('../../openssl');
const getHash = require('../../utils/hash');
const { checkMigrate, getZone } = require('../../acme/utils');
const { mkdirSafe, checkFileExists } = require('../../utils/fs');
const { file } = require('../../utils/tpl');
const { endsWithAny, compareHost, SECGTONIST, NISTTOSECG } = require('../../utils');

module.exports = {
    async generate(o) {
        const sslOn = o.config.routing.ssl && o.config.routing.ssl.defaultPreset && o.config.routing.ssl.presets;
        if (!sslOn) {
            return;
        }

        const debug = o.debug.extend('acme');
        debug('start');

        const zonesPath = path.normalize(`${o.config._outputPath}/dns`);
        const acmeZonesConf = `${zonesPath}/acme.conf`;
        const acmePath = path.normalize(`${o.argv.home}/acme`);
        const acmeDnsPath = `${acmePath}/dns`;
        const accountsPath = `${acmePath}/accounts`;

        await Promise.all([
            mkdirSafe(zonesPath),
            mkdirSafe(acmeDnsPath),
        ]);

        const dnsAcmePath = o.config.routing?.options?.nginx?.pathAcme || o.argv.dnsPathAcme || `${o.argv.replaceHome || o.argv.home}/acme/dns`;
        const acmeConfigPath = `${acmePath}/acme.json`;
        const acmeConfig = {
            directory: o.config.routing?.options?.acme?.directory,
            accounts: {},
        };
        const { accounts } = acmeConfig;
        const acmeConf = {};
        const otherPromises = [];


        const masterDomainsByHost = {};
        function getMasterDomains(host) {
            if (masterDomainsByHost[host]) {
                return masterDomainsByHost[host];
            }
            const masterView = o.config.parser.makeView(host);
            const domainsSource = masterView.buildDnsView(null);
            const masterDomains = [];
            for (const item of domainsSource.list) {
                if (item.mode !== 'slave') {
                    masterDomains.push(item.key);
                }
            }
            masterDomainsByHost[host] = masterDomains;
            return masterDomains;
        }


        async function checkAccountKey(preset) {
            const accountPath = `${accountsPath}/${preset.key}`;
            const acmeAccountKeyPath = `${accountPath}/acme-account.key`;
            if (await checkFileExists(acmeAccountKeyPath)) {
                debug(`${preset.key}: acme account key: found`);
            } else {
                const accountKey = await acme.crypto.createPrivateKey();
                await fs.writeFile(acmeAccountKeyPath, accountKey);
                debug(`${preset.key}: acme account key: created`);
            }
        }

        const accountCheckPath = {};
        async function processRoute(route) {
            if (typeof route.source.ssl === 'string' && route.source.ssl.match(/^use:.*/)) {
                return;
            }
            const preset = openssl.getPreset(route);
            if (preset && preset.acmeAny) {
                const accountPath = `${accountsPath}/${preset.key}`;
                const workdirPath = `${accountPath}/workdir`;
                const exportPath = `${accountPath}/export`;

                if (!accountCheckPath[accountPath]) {
                    accountCheckPath[accountPath] = Promise.all([
                        mkdirSafe(workdirPath),
                        mkdirSafe(exportPath),
                    ]);
                }

                if (!accounts[preset.key]) {
                    const account = {
                        master: preset.master,
                        slaves: [],
                        provider: preset.acme,
                        email: preset.email,
                        domains: [],
                        mirrorDomainSuffix: preset.mirrorDomainSuffix,
                    };
                    accounts[preset.key] = account;

                    if (preset.master) {
                        debug(`${preset.key}: master: '${preset.master}'`);
                        account.slaves = Object.keys(o.config.parser.routers.map).filter((x) => x !== preset.master);
                    } else {
                        debug(`${preset.key}: master: undefined`);
                    }

                    if (preset.master === o.config._hostname) {
                        await accountCheckPath[accountPath];
                        otherPromises.push(checkAccountKey(preset));
                    }
                }

                const account = accounts[preset.key];
                const sslUse = o.config._sslUse[route.key];
                const altNames = Array.isArray(sslUse) ? [...sslUse] : [];
                const keySize = openssl.getKeySize(preset);
                const domain = {
                    commonName: route.key,
                    altNames,
                    keySize,
                    type: preset.type,
                };
                account.domains.push(domain);

                if (preset.acmeDns) {
                    account.masterDomains = getMasterDomains(preset.master || o.config._hostname);

                    // Removes altnames that goes into wildcard
                    let rIdx = 0;
                    for (const [i, v] of Object.entries(altNames)) {
                        if (v.match(new RegExp(`.${route.key}$`))) {
                            altNames.splice(Number.parseInt(i, 10) + rIdx, 1);
                            rIdx = rIdx - 1;
                        }
                    }

                    if (preset.mirrorDomainSuffix) {
                        if (!endsWithAny(`.${preset.mirrorDomainSuffix}`, account.masterDomains || [])) {
                            throw new Error(`${preset.key}: mirrorDomainSuffix(${preset.mirrorDomainSuffix}) is not in masterDomains, it is impossible to get certificate!`);
                        }
                    } else {
                        if (!endsWithAny(`.${route.key}`, account.masterDomains || [])) {
                            throw new Error(`${preset.key}: route(${route.key}) is not in masterDomains, it is impossible to get certificate!`);
                        }
                        for (const altName of altNames) {
                            if (!endsWithAny(`.${altName}`, account.masterDomains || [])) {
                                throw new Error(`${preset.key}: route(${route.key}): altName(${altName}) is not in masterDomains, it is impossible to get certificate!`);
                            }
                        }
                    }

                    if (preset.master === o.config._hostname) {
                        const zones = [
                            route.key,
                            ...altNames,
                        ];
                        if (preset.mirrorDomainSuffix) {
                            zones.push(`${route.key}.${preset.mirrorDomainSuffix}`);
                            for (const altName of altNames) {
                                zones.push(`${altName}.${preset.mirrorDomainSuffix}`);
                            }
                        }

                        const { email } = accounts[preset.key];
                        const mname = `${o.config.parser.router.key}.`;
                        const rname = `${(email || `admin@${o.config.parser.router.key}`).replace('@', '.')}.`;
                        const ns = [preset.master];
                        domain.dns = {
                            mname,
                            rname,
                            ns,
                        };

                        for (const zoneKey of zones) {
                            const zone = `_acme-challenge.${zoneKey}`;
                            if (!endsWithAny(zone, account.masterDomains || [])) {
                                debug(`${preset.key}: route(${route.key})${route.key === zoneKey ? ':' : ` altName(${zoneKey})`} is not in masterDomains`);
                                continue;
                            }
                            const zoneFilePath = `${acmeDnsPath}/${zone}.dns`;

                            acmeConf[zoneKey] = file`
                                zone "${zone}" {
                                    type master;
                                    file "${dnsAcmePath}/${zone}.dns";
                                };
                            `;

                            const key = account.masterDomains.filter((x) => `.${zoneKey}`.match(new RegExp(`${x}$`))).sort().pop();
                            debug(`${preset.key}: ${key}, ${zoneKey}, masterDomains: ${JSON.stringify(account.masterDomains, null, 4)}`);

                            otherPromises.push(fs.writeFile(zoneFilePath, getZone(zone, mname, rname, ns)));
                        }
                    }
                    altNames.push(`*.${route.key}`);
                }

                await accountCheckPath[accountPath];
                await checkMigrate(`${workdirPath}/host-${route.key}`);

                const hash = getHash({
                    commonName: route.key,
                    altNames,
                    keySize,
                });
                const pathPrefix = `${workdirPath}/host-${route.key}-${hash}`;
                const keyPath = `${pathPrefix}.key`;
                const csrPath = `${pathPrefix}.csr`;
                let csrUpdate = false;
                if (await checkFileExists(keyPath) && await checkFileExists(csrPath)) {
                    try {
                        const csrRaw = await fs.readFile(csrPath, 'utf8');
                        const csrDec = x509.PemConverter.decodeFirst(csrRaw);
                        const csr = new x509.Pkcs10CertificateRequest(csrDec);
                        if (csr?.signatureAlgorithm?.hash?.name === 'SHA-1') {
                            throw new Error('old hash algo');
                        }
                    } catch {
                        csrUpdate = true;
                        debug(`${preset.key}: CSR for ${route.key} will be updated`);
                    }
                } else {
                    csrUpdate = true;
                }
                if (csrUpdate) {
                    const routeKey = await (typeof keySize === 'string' ? acme.crypto.createPrivateEcdsaKey(NISTTOSECG[keySize] ? keySize : SECGTONIST[keySize]) : acme.crypto.createPrivateRsaKey(keySize));
                    const [, routeCSR] = await acme.crypto.createCsr({
                        commonName: route.key,
                        altNames: [...altNames],
                    }, routeKey);
                    await Promise.all([
                        fs.writeFile(keyPath, routeKey),
                        fs.writeFile(csrPath, routeCSR),
                    ]);
                }

                debug(`${preset.key}: domain '${route.key}' ${altNames.length > 0 ? `with '${altNames}' altnames ` : ''}has been added`);
            }
        }

        const routePromises = []
        for (const route of o.config.parser.targetListWeb) {
            routePromises.push(processRoute(route));
        }
        await Promise.all(routePromises);

        acmeConfig.accounts = Object.fromEntries(Object.entries(acmeConfig.accounts).sort((a, b) => a[0].localeCompare(b[0])));
        for (const account of Object.values(acmeConfig.accounts)) {
            account.domains = account.domains.sort((a, b) => compareHost(a.commonName, b.commonName));
        }
        await Promise.all([
            fs.writeFile(acmeZonesConf, Object.entries(acmeConf).sort((a, b) => compareHost(a[0], b[0])).map((x) => x[1]).join('\n')),
            fs.writeFile(acmeConfigPath, JSON.stringify(acmeConfig, null, 4)),
            ...otherPromises,
        ]);

        await exec(`mkdir -p ${o.config._outputPath}/acme; cp -R ${acmeConfigPath} ${acmePath}/dns ${o.config._outputPath}/acme/`);

        debug('done');
    },
};
