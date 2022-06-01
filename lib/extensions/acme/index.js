const fs = require('fs/promises');
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const acme = require('acme-client');

const argv = require('../../argv');
const config = require('../../configuration');
const openssl = require('../../openssl');
const getHash = require('../../utils/hash');
const { checkMigrate, getZone } = require('../../acme/utils');
const { mkdirSafe, checkFileExists } = require('../../utils/fs');
const { file } = require('../../utils/tpl');

module.exports = {
    async generate(o) {
        const debug = o.debug.extend('acme');
        debug('start');

        const zonesPath = path.normalize(`${config._outputPath}/dns`);
        const acmeZonesConf = `${zonesPath}/acme.conf`;
        const acmePath = path.normalize(`${argv.home}/acme`);
        const acmeDnsPath = `${acmePath}/dns`;
        const accountsPath = `${acmePath}/accounts`;

        await Promise.all([
            mkdirSafe(zonesPath),
            mkdirSafe(acmePath),
            mkdirSafe(acmeDnsPath),
            mkdirSafe(accountsPath),
        ]);

        const dnsAcmePath = config.routing?.options?.nginx?.pathAcme || argv.dnsPathAcme || `${argv.replaceHome || argv.home}/acme/dns`;

        const acmeConfigPath = `${acmePath}/acme.json`;
        const acmeConfig = {
            accounts: {},
        };

        const { accounts } = acmeConfig;

        const acmeConf = {};
        const domainsSource = config.parser.buildDnsView(null).map;
        const domainsKeys = Object.keys(domainsSource);
        for (const route of config.parser.targetListWeb) {
            if (typeof route.source.ssl === 'string' && route.source.ssl.match(/^use:.*/)) {
                continue;
            }
            const preset = openssl.getPreset(route);
            if (preset && (preset.type === 'acme' || preset.type === 'acme-http-01' || preset.type === 'acme-dns-01')) {
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
                    };

                    if (preset.master) {
                        debug(`${preset.key}: master: '${preset.master}'`);
                        account.slaves = Object.keys(config.parser.routers.map).filter((x) => x !== preset.master);
                    } else {
                        debug(`${preset.key}: master: undefined`);
                    }

                    accounts[preset.key] = account;

                    if (preset.master === config._hostname) {
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

                const sslUse = config._sslUse[route.key];
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

                if (preset.type === 'acme-dns-01') {
                    let rIdx = 0;
                    for (const [i, v] of Object.entries(altNames)) {
                        if (v.match(new RegExp(`.${route.key}$`))) {
                            altNames.splice((i | 0) + rIdx, 1);
                            rIdx = rIdx - 1;
                        }
                    }
                    if (preset.master === config._hostname) {
                        const zones = [
                            route.key,
                            ...altNames,
                        ];
                        for (const zoneKey of zones) {
                            const zone = `_acme-challenge.${zoneKey}`;
                            const zoneFilePath = `${acmeDnsPath}/${zone}.dns`;

                            acmeConf[zoneKey] = file`
                                zone "${zone}" {
                                    type master;
                                    file "${dnsAcmePath}/${zone}.dns";
                                };
                            `;

                            const { email } = accounts[preset.key];
                            const mname = `${config.parser.router.key}.`;
                            const rname = `${(email || `admin@${config.parser.router.key}`).replace('@', '.')}.`;
                            const key = domainsKeys.filter((x) => `.${zoneKey}`.match(new RegExp(`${x}$`))).sort().pop();
                            debug(`${preset.key}: ${key}, ${zoneKey}, ${JSON.stringify(domainsKeys, null, 4)}`);
                            const ns = [preset.master];

                            domain.dns = {
                                mname,
                                rname,
                                ns,
                            };

                            await fs.writeFile(zoneFilePath, getZone(zone, mname, rname, ns));
                        }
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
                if (!await checkFileExists(`${pathPrefix}.key`)) {
                    const [routeKey, routeCSR] = await acme.forge.createCsr({
                        commonName: route.key,
                        altNames: [...altNames],
                        keySize,
                    });
                    await Promise.all([
                        fs.writeFile(`${pathPrefix}.key`, routeKey),
                        fs.writeFile(`${pathPrefix}.csr`, routeCSR),
                    ]);
                }

                debug(`${preset.key}: domain '${route.key}' ${altNames.length ? `with '${altNames}' altnames ` : ''}has been added`);
            }
        }

        await Promise.all([
            fs.writeFile(acmeZonesConf, Object.values(acmeConf).join('\n')),
            fs.writeFile(acmeConfigPath, JSON.stringify(acmeConfig, null, 4)),
        ]);

        await exec(`mkdir -p ${config._outputPath}/acme; cp -R ${acmeConfigPath} ${acmePath}/dns ${config._outputPath}/acme/`);

        debug('done');
    },
};
