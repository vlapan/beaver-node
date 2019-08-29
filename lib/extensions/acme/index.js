const fs = require('fs');

const argv = require(`${__dirname}/../../argv`);
const config = require(`${__dirname  }/../../configuration`);
const logger = require(`${__dirname  }/../../logger`);

const acme = require('acme-client');

module.exports = {
    generate(callback) {
        logger.banner('ACME configuration generation');

        const acmePath = `${argv.home}/acme`;
        if (!fs.existsSync(acmePath)) {
            fs.mkdirSync(acmePath);
        }

        const acmeConfigPath = `${acmePath}/acme.json`;

        const accountsPath = `${acmePath}/accounts`
        if (!fs.existsSync(accountsPath)) {
            fs.mkdirSync(accountsPath);
        }

        const acmeConfig = {};

        acmeConfig.path = `${argv.home}/acme`;

        let forcedLeader;
        for (const router of config.parser.routers.list) {
            if (router.source.acme === true) {
                forcedLeader = router;
                break;
            } else if (forcedLeader === undefined && router.isActive) {
                forcedLeader = router;
            }
        }

        if (!forcedLeader) {
            logger.log('error', `acme: errors: 'no active router found!'`);
            callback && callback(null, true);
            return;
        }

        acmeConfig.leader = forcedLeader.key;
        // acmeConfig.active = config.parser.router.key === forcedLeader.key;
        logger.log('info', `acme: leader: '${acmeConfig.leader}'`);

        acmeConfig.accounts = {};
        const {presets} = config.routing.ssl;
        for (const [presetKey, preset] of Object.entries(presets)) {
            if (preset.type === 'acme' || preset.type === 'acme-http-01') {
                acmeConfig.accounts[presetKey] = {
                    provider: preset.acme,
                    email: preset.email,
                    domains: [],
                };
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

        for (const route of config.parser.targetListWeb) {
            const presetKey = route.source.ssl;
            const preset = presets[presetKey];
            if (preset && (preset.type === 'acme' || preset.type === 'acme-http-01')) {
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
                logger.log('info', `acme: domain: '${route.key}' with '${altNames}' altnames has been added to '${presetKey}' account`);
            }
        }

        fs.writeFile(acmeConfigPath, JSON.stringify(acmeConfig, null, 4), function (err) {
            callback && callback(err, true);
        });

    }
};
