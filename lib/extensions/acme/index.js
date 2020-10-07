const fs = require('fs/promises');
const path = require('path');
const acme = require('acme-client');

const argv = require('../../argv');
const config = require('../../configuration');

const { mkdirSafe, checkFileExists } = require('../../utils/fs');

function ltrim(text) {
    return text.replace(/^\n/, '').replace(/^[ ]+/gm, '');
}

module.exports = {
    async generate(o) {
        const debug = o.debug.extend('acme');
        debug('start');

        const zonesPath = path.normalize(`${config._outputPath}/dns`);
        await mkdirSafe(zonesPath);

        const dnsAcmePath = path.normalize(`${zonesPath}/acme`);
        await mkdirSafe(dnsAcmePath);

        const acmePath = `${argv.home}/acme`;
        await mkdirSafe(acmePath);

        const acmeConfigPath = `${acmePath}/acme.json`;

        const accountsPath = `${acmePath}/accounts`;
        await mkdirSafe(accountsPath);

        const acmeConfig = {
            path: acmePath,
            accounts: {},
        };

        const { presets } = config.routing.ssl;
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
                    debug(`${presetKey}: master '${preset.master}'`);
                    for (const router of config.parser.routers.list) {
                        if (router.source.key !== preset.master) {
                            account.slaves.push(router.source.key);
                        }
                    }
                } else {
                    debug(`${presetKey}: master: undefined`);
                }

                acmeConfig.accounts[presetKey] = account;

                const accountPath = `${accountsPath}/${presetKey}`;
                await mkdirSafe(accountPath);
                const acmeAccountKeyPath = `${accountPath}/acme-account.key`;
                if (!await checkFileExists(acmeAccountKeyPath)) {
                    debug(`${presetKey}: acme account key: not found`);
                    const accountKey = await acme.forge.createPrivateKey();
                    await fs.writeFile(acmeAccountKeyPath, accountKey);
                    debug(`${presetKey}: acme account key: created`);
                } else {
                    debug(`${presetKey}: acme account key: found`);
                }
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

                const workdirPath = `${accountPath}/workdir`;
                await mkdirSafe(workdirPath);
                const exportPath = `${accountPath}/export`;
                await mkdirSafe(exportPath);

                const pathPrefix = `${workdirPath}/host-${route.key}`;
                if (!await checkFileExists(`${pathPrefix}.key`)) {
                    const [routeKey, routeCSR] = await acme.forge.createCsr({
                        commonName: route.key,
                        altNames,
                    });
                    await fs.writeFile(`${pathPrefix}.key`, routeKey);
                    await fs.writeFile(`${pathPrefix}.csr`, routeCSR);
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
                            ; Zone: ${zone}.
                            ; Exported  (yyyy-mm-ddThh:mm:ss.sssZ): ${serial.toISOString()}

                            $ORIGIN ${zone}.
                            $TTL 30

                            ; SOA Record
                            @ IN SOA ${mname} ${rname} (
                            	${serial.getTime() / 1000 | 0}       ;serial
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

                debug(`${presetKey}: domain '${route.key}' with '${altNames}' altnames has been added`);
            }
        }

        await fs.writeFile(`${zonesPath}/acme.conf`, Object.values(acmeConf).join('\n'), 'UTF-8');

        await fs.writeFile(acmeConfigPath, JSON.stringify(acmeConfig, null, 4));

        debug('done');
    }
};
