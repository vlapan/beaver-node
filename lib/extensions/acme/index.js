const fs = require('fs/promises');
const path = require('path');
const acme = require('acme-client');

const argv = require('../../argv');
const config = require('../../configuration');
const openssl = require('../../openssl');
const getHash = require('../../utils/hash');
const { checkMigrate } = require('../../acme/utils');
const { mkdirSafe, checkFileExists } = require('../../utils/fs');

function ltrim(text) {
    return text.replace(/^\n/, '').replace(/^[ ]+/gm, '');
}

module.exports = {
    async generate(o) {
        const debug = o.debug.extend('acme');
        debug('start');

        const zonesPath = path.normalize(`${config._outputPath}/dns`);
        const dnsAcmePath = path.normalize(`${zonesPath}/acme`);
        const acmePath = `${argv.home}/acme`;
        const accountsPath = `${acmePath}/accounts`;

        await Promise.all([
            mkdirSafe(zonesPath),
            mkdirSafe(dnsAcmePath),
            mkdirSafe(acmePath),
            mkdirSafe(accountsPath),
        ]);

        const acmeConfigPath = `${acmePath}/acme.json`;
        const acmeConfig = {
            path: acmePath,
            accounts: {},
        };

        const { accounts } = acmeConfig;

        const acmeConf = {};
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
                        for (const router of config.parser.routers.list) {
                            if (router.source.key !== preset.master) {
                                account.slaves.push(router.source.key);
                            }
                        }
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

                accounts[preset.key].domains.push({
                    commonName: route.key,
                    altNames,
                    keySize,
                    type: preset.type,
                });

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

                if (preset.type === 'acme-dns-01') {
                    const zone = `_acme-challenge.${route.key}`;
                    if (preset.master === config._hostname) {
                        const allowTransfer = config.parser.routers.list.reduce((a, b) => {
                            a.push(b.wan3);
                            return a;
                        }, []).join(';');

                        acmeConf[route.key] = ltrim(`
                            zone "${zone}" {
                            	type master;
                            	file "master/beaver/acme/${zone}.dns";
                            	allow-transfer { ${allowTransfer}; };
                            };
                        `);

                        const date = new Date();
                        const serial = date.getTime() / 1000 | 0;
                        const { email } = accounts[preset.key];
                        const mname = `${config.parser.router.key}.`;
                        const rname = `${(email || `admin@${config.parser.router.key}`).replace('@', '.')}.`;
                        const ns = config.parser.routers.list.reduce((a, b) => `${a}@ IN NS ${b.source.key}.\n`, '');

                        const zoneContent = ltrim(`
                            ; Zone: ${zone}.
                            ; Exported  (yyyy-mm-ddThh:mm:ss.sssZ): ${date.toISOString()}

                            $ORIGIN ${zone}.
                            $TTL 30

                            ; SOA Record
                            @ IN SOA ${mname} ${rname} (
                            	${serial}       ;serial
                            	30      ;refresh
                            	15      ;retry
                            	60480   ;expire
                            	60      ;minimum ttl
                            )

                            ${ns}

                            vendor       IN      TXT     beaver-l6route   ; beaver
                        `);
                        await fs.writeFile(`${dnsAcmePath}/${zone}.dns`, zoneContent);
                    } else {
                        acmeConf[route.key] = ltrim(`
                            zone "${zone}" {
                            	type slave;
                            	file "slave/beaver-${zone}";
                            	masters { ${config.parser.routers.map[preset.master].wan3}; };
                            };
                        `);
                    }
                }
                debug(`${preset.key}: domain '${route.key}' ${altNames.length ? `with '${altNames}' altnames ` : ''}has been added`);
            }
        }

        await Promise.all([
            fs.writeFile(`${zonesPath}/acme.conf`, Object.values(acmeConf).join('\n')),
            fs.writeFile(acmeConfigPath, JSON.stringify(acmeConfig, null, 4)),
        ]);

        debug('done');
    }
};
