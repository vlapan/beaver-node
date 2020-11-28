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
        const acmePath = path.normalize(`${argv.home}/acme`);
        const acmeDnsPath = `${acmePath}/dns`;
        const accountsPath = `${acmePath}/accounts`;

        await Promise.all([
            mkdirSafe(zonesPath),
            mkdirSafe(acmePath),
            mkdirSafe(acmeDnsPath),
            mkdirSafe(accountsPath),
        ]);

        const acmeConfigPath = `${acmePath}/acme.json`;
        const acmeConfig = {
            path: acmePath,
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

                    const acmeAccountKeyPath = `${accountPath}/acme-account.key`;
                    if (!await checkFileExists(acmeAccountKeyPath)) {
                        const accountKey = await acme.forge.createPrivateKey();
                        await fs.writeFile(acmeAccountKeyPath, accountKey);
                        debug(`${preset.key}: acme account key: created`);
                    } else {
                        debug(`${preset.key}: acme account key: found`);
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
                    altNames.push(`*.${route.key}`);
                    const zone = `_acme-challenge.${route.key}`;
                    if (preset.master === config._hostname) {
                        const zoneFilePath = `${acmeDnsPath}/${zone}.dns`;
                        const allowTransfer = config.parser.routers.list.reduce((a, b) => {
                            a.push(b.wan3);
                            return a;
                        }, []).join(';');

                        acmeConf[route.key] = file`
                            zone "${zone}" {
                                type master;
                                file "${zoneFilePath}";
                                allow-transfer { ${allowTransfer}; };
                            };
                        `;

                        const { email } = accounts[preset.key];
                        const mname = `${config.parser.router.key}.`;
                        const rname = `${(email || `admin@${config.parser.router.key}`).replace('@', '.')}.`;
                        const key = domainsKeys.filter((x) => `.${route.key}`.match(new RegExp(`${x}$`))).sort().pop();
                        debug(`${preset.key}: ${key}, ${route.key}, ${JSON.stringify(domainsKeys, null, 4)}`);
                        // const ns = (domainsSource[key].toSourceObject()).dns.NS['@'].map((x) => x[x.length - 1] === '.' ? x.slice(0, x.length - 1) : `${x}.${route.key}`);
                        const ns = [preset.master];
                        // const ns = Object.entries(config.parser.routers.map).reduce((acc, entry) => {
                        //     const [key, router] = entry;
                        //     if (router.source.router === 'active') {
                        //         acc.push(`@ IN NS ${key}.`);
                        //     }
                        //     return acc;
                        // }, []);

                        domain.dns = {
                            mname,
                            rname,
                            ns,
                        };

                        await fs.writeFile(zoneFilePath, getZone(zone, mname, rname, ns));
                    }
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
            fs.writeFile(`${zonesPath}/acme.conf`, Object.values(acmeConf).join('\n')),
            fs.writeFile(acmeConfigPath, JSON.stringify(acmeConfig, null, 4)),
        ]);

        await exec(`mkdir -p ${config._outputPath}/acme; cp -R ${acmeConfigPath} ${acmePath}/dns ${config._outputPath}/acme/`);

        debug('done');
    },
};
