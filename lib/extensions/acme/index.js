const fs = require('fs');
const path = require('path');
const acme = require('acme-client');

const argv = require('../../argv');
const config = require('../../configuration');
const logger = require('../../logger');

function ltrim(text) {
    return text.replace(/^\n/,'').replace(/^[ ]+/gm, '');
}

module.exports = {
    generate(callback) {
        logger.banner('ACME configuration generation');

        const zonesPath = path.normalize(`${config._outputPath}/dns`);
        if (!fs.existsSync(zonesPath)) {
            fs.mkdirSync(zonesPath, {
                recursive: true,
            });
        }

        const dnsAcmePath = path.normalize(`${zonesPath}/acme`);
        if (!fs.existsSync(dnsAcmePath)) {
            fs.mkdirSync(dnsAcmePath, {
                recursive: true,
            });
        }

        const acmePath = `${argv.home}/acme`;
        if (!fs.existsSync(acmePath)) {
            fs.mkdirSync(acmePath);
        }

        const acmeConfigPath = `${acmePath}/acme.json`;

        const accountsPath = `${acmePath}/accounts`
        if (!fs.existsSync(accountsPath)) {
            fs.mkdirSync(accountsPath);
        }

        const acmeConfig = {
            path: acmePath,
            accounts: {},
        };

        const {presets} = config.routing.ssl;
        for (const [presetKey, preset] of Object.entries(presets)) {
            if (preset.type === 'acme' || preset.type === 'acme-http-01' || preset.type === 'acme-dns-01') {
                const account = {
                    master: preset.master,
                    slaves: [],
                    provider: preset.acme,
                    email: preset.email,
                    domains: [],
                };

                if (preset.master) {
                    logger.log('info', `acme: preset: ${presetKey}: master '${preset.master}'`);
                    for (const router of config.parser.routers.list) {
                        if (router.source.key !== preset.master) {
                            account.slaves.push(router.source.key);
                        }
                    }
                } else {
                    logger.log('warn', `acme: preset: ${presetKey}: master: undefined`);
                }

                acmeConfig.accounts[presetKey] = account;

                const accountPath = `${accountsPath}/${presetKey}`
                if (!fs.existsSync(accountPath)) {
                    fs.mkdirSync(accountPath);
                }
                (
                    async function () {
                        const acmeAccountKeyPath = `${accountPath}/acme-account.key`;
                        if (!fs.existsSync(acmeAccountKeyPath)) {
                            const accountKey = await acme.forge.createPrivateKey();
                            fs.writeFileSync(acmeAccountKeyPath, accountKey);
                        }
                    }
                )();
            }
        }

        const acmeConf = {};
        for (const route of config.parser.targetListWeb) {
            const presetKey = route.source.ssl;
            const preset = presets[presetKey];
            if (preset && (preset.type === 'acme' || preset.type === 'acme-http-01' || preset.type === 'acme-dns-01')) {
                const altNames = [];
                acmeConfig.accounts[presetKey].domains.push({
                    commonName: route.key,
                    altNames,
                });
                const accountPath = `${accountsPath}/${presetKey}`;

                const workdirPath = `${accountPath}/workdir`
                if (!fs.existsSync(workdirPath)) {
                    fs.mkdirSync(workdirPath);
                }
                const exportPath = `${accountPath}/export`
                if (!fs.existsSync(exportPath)) {
                    fs.mkdirSync(exportPath);
                }

                const pathPrefix = `${workdirPath}/host-${route.key}`
                if (!fs.existsSync(`${pathPrefix}.key`)) {
                    (
                        async function () {
                            const [routeKey, routeCSR] = await acme.forge.createCsr({
                                commonName: route.key,
                                altNames,
                            });
                            fs.writeFileSync(`${pathPrefix}.key`, routeKey);
                            fs.writeFileSync(`${pathPrefix}.csr`, routeCSR);
                        }
                    )();
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
                        const serial = new Date();
                        const { email } = acmeConfig.accounts[presetKey];
                        const mname = `${config.parser.router.key}.`;
                        const rname = `${(email || `admin@${config.parser.router.key}`).replace('@', '.')}.`;
                        let ns = '';
                        for (const router of config.parser.routers.list) {
                            ns += `@ IN NS ${router.source.key}.\n`;
                        }

                        const zoneContent = ltrim(`
                            ; Zone: ${route.key}.
                            ; Exported  (yyyy-mm-ddThh:mm:ss.sssZ): ${serial.toISOString()}

                            $ORIGIN ${route.key}.
                            $TTL 30

                            ; SOA Record
                            @ IN SOA ${mname} ${rname} (
                            	${serial.getTime()/1000|0}       ;serial
                            	30      ;refresh
                            	15      ;retry
                            	60480   ;expire
                            	60      ;minimum ttl
                            )

                            ${ns}
                        `);
                        fs.writeFileSync(`${dnsAcmePath}/${zone}.dns`, zoneContent, 'UTF-8');
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

                logger.log('info', `acme: preset: ${presetKey}: domain '${route.key}' with '${altNames}' altnames has been added`);
            }
        }

        fs.writeFileSync(`${zonesPath}/acme.conf`, Object.values(acmeConf).join('\n'), 'UTF-8');

        fs.writeFile(acmeConfigPath, JSON.stringify(acmeConfig, null, 4), function (err) {
            callback && callback(err, true);
        });

    }
};
