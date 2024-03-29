const fs = require('fs/promises');
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const acme = require('acme-client');
const forge = require('node-forge');

const openssl = require('../../openssl');
const getHash = require('../../utils/hash');
const { checkMigrate, getZone } = require('../../acme/utils');
const { mkdirSafe, checkFileExists } = require('../../utils/fs');
const { file } = require('../../utils/tpl');
const { endsWithAny } = require('../../utils');

module.exports = {
    async generate(o) {
        const debug = o.debug.extend('acme');
        debug('start');

        const zonesPath = path.normalize(`${o.config._outputPath}/dns`);
        const acmeZonesConf = `${zonesPath}/acme.conf`;
        const acmePath = path.normalize(`${o.argv.home}/acme`);
        const acmeDnsPath = `${acmePath}/dns`;
        const accountsPath = `${acmePath}/accounts`;

        await Promise.all([
            mkdirSafe(zonesPath),
            mkdirSafe(acmePath),
            mkdirSafe(acmeDnsPath),
            mkdirSafe(accountsPath),
        ]);

        const dnsAcmePath = o.config.routing?.options?.nginx?.pathAcme || o.argv.dnsPathAcme || `${o.argv.replaceHome || o.argv.home}/acme/dns`;

        const acmeConfigPath = `${acmePath}/acme.json`;
        const acmeConfig = {
            accounts: {},
        };

        const { accounts } = acmeConfig;

        const acmeConf = {};
        for (const route of o.config.parser.targetListWeb) {
            if (typeof route.source.ssl === 'string' && route.source.ssl.match(/^use:.*/)) {
                continue;
            }
            const preset = openssl.getPreset(route);
            if (preset && preset.acmeAny) {
                const accountPath = `${accountsPath}/${preset.key}`;
                const workdirPath = `${accountPath}/workdir`;
                const exportPath = `${accountPath}/export`;

                await Promise.all([
                    mkdirSafe(workdirPath),
                    mkdirSafe(exportPath),
                ]);

                if (!accounts[preset.key]) {
                    const account = {
                        master: preset.master,
                        slaves: [],
                        provider: preset.acme,
                        email: preset.email,
                        domains: [],
                        mirrorDomainSuffix: preset.mirrorDomainSuffix,
                    };

                    if (preset.master) {
                        debug(`${preset.key}: master: '${preset.master}'`);
                        account.slaves = Object.keys(o.config.parser.routers.map).filter((x) => x !== preset.master);
                    } else {
                        debug(`${preset.key}: master: undefined`);
                    }

                    accounts[preset.key] = account;

                    if (preset.master === o.config._hostname) {
                        const acmeAccountKeyPath = `${accountPath}/acme-account.key`;
                        if (!await checkFileExists(acmeAccountKeyPath)) {
                            const accountKey = await acme.forge.createPrivateKey();
                            await fs.writeFile(acmeAccountKeyPath, accountKey);
                            debug(`${preset.key}: acme account key: created`);
                        } else {
                            debug(`${preset.key}: acme account key: found`);
                        }
                    }
                }

                const sslUse = o.config._sslUse[route.key];
                const altNames = Array.isArray(sslUse) ? sslUse : [];
                const keySize = openssl.getKeySize(preset);
                const account = accounts[preset.key];
                const domain = {
                    commonName: route.key,
                    altNames,
                    keySize,
                    type: preset.type,
                };
                account.domains.push(domain);

                if (preset.acmeDns) {
                    const masterView = o.config.parser.makeView(preset.master || o.config._hostname);
                    const domainsSource = masterView.buildDnsView(null);
                    const masterDomains = [];
                    for (const item of domainsSource.list) {
                        if (item.mode !== 'slave') {
                            masterDomains.push(item.key);
                        }
                    }
                    account.masterDomains = masterDomains;

                    let rIdx = 0;
                    for (const [i, v] of Object.entries(altNames)) {
                        if (v.match(new RegExp(`.${route.key}$`))) {
                            altNames.splice((i | 0) + rIdx, 1);
                            rIdx = rIdx - 1;
                        }
                    }
                    if (preset.master === o.config._hostname) {
                        const zonePromises = [];
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

                        for (const zoneKey of zones) {
                            const zone = `_acme-challenge.${zoneKey}`;
                            if (!endsWithAny(zone, account.masterDomains || [])) {
                                debug(`${preset.key}: not in masterDomains: ${zone}, masterDomains: ${JSON.stringify(account.masterDomains, null, 4)}`);
                                continue;
                            }
                            const zoneFilePath = `${acmeDnsPath}/${zone}.dns`;

                            acmeConf[zoneKey] = file`
                                zone "${zone}" {
                                    type master;
                                    file "${dnsAcmePath}/${zone}.dns";
                                };
                            `;

                            const { email } = accounts[preset.key];
                            const mname = `${o.config.parser.router.key}.`;
                            const rname = `${(email || `admin@${o.config.parser.router.key}`).replace('@', '.')}.`;
                            const key = account.masterDomains.filter((x) => `.${zoneKey}`.match(new RegExp(`${x}$`))).sort().pop();
                            debug(`${preset.key}: ${key}, ${zoneKey}, masterDomains: ${JSON.stringify(account.masterDomains, null, 4)}`);
                            const ns = [preset.master];

                            domain.dns = {
                                mname,
                                rname,
                                ns,
                            };

                            zonePromises.push(fs.writeFile(zoneFilePath, getZone(zone, mname, rname, ns)));
                        }
                        await Promise.all(zonePromises);
                    }
                    altNames.push(`*.${route.key}`);
                }

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
                if (await checkFileExists(csrPath)) {
                    const csr = forge.pki.certificationRequestFromPem(await fs.readFile(csrPath));
                    if (csr.signatureOid === '1.2.840.113549.1.1.5') { // sha1WithRSAEncryption
                        csrUpdate = true;
                        debug(`${preset.key}: CSR for ${route.key} will be updated`);
                    }
                } else {
                    csrUpdate = true;
                }
                if (csrUpdate || !await checkFileExists(keyPath)) {
                    const [routeKey, routeCSR] = await acme.forge.createCsr({
                        commonName: route.key,
                        altNames: [...altNames],
                        keySize,
                    });
                    await Promise.all([
                        fs.writeFile(keyPath, routeKey),
                        fs.writeFile(csrPath, routeCSR),
                    ]);
                }

                debug(`${preset.key}: domain '${route.key}' ${altNames.length ? `with '${altNames}' altnames ` : ''}has been added`);
            }
        }

        await Promise.all([
            fs.writeFile(acmeZonesConf, Object.values(acmeConf).join('\n')),
            fs.writeFile(acmeConfigPath, JSON.stringify(acmeConfig, null, 4)),
        ]);

        await exec(`mkdir -p ${o.config._outputPath}/acme; cp -R ${acmeConfigPath} ${acmePath}/dns ${o.config._outputPath}/acme/`);

        debug('done');
    },
};
