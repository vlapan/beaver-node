const fs = require('fs');

const argv = require(`${__dirname}/../../argv`);
const config = require(`${__dirname  }/../../configuration`);
const logger = require(`${__dirname  }/../../logger`);

const acmeClient = require('acme-client');

module.exports = {
    generate(callback) {
        logger.banner('ACME configuration generation');

        const acmePath = `${argv.home}/acme`;
        if (!fs.existsSync(acmePath)) {
            fs.mkdirSync(acmePath);
        }
        const accountsPath = `${acmePath}/accounts`
        if (!fs.existsSync(accountsPath)) {
            fs.mkdirSync(accountsPath);
        }

        const acme = {};

        acme.path = `${argv.home}/acme`;

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

        acme.leader = forcedLeader.key;
        // acme.active = config.parser.router.key === forcedLeader.key;
        logger.log('info', `acme: leader: '${acme.leader}'`);

        acme.accounts = {};
        const {presets} = config.routing.ssl;
        for (const [presetKey, preset] of Object.entries(presets)) {
            if (preset.type === 'acme' || preset.type === 'acme-http-01') {
                acme.accounts[presetKey] = {
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
                            const accountKey = await acmeClient.forge.createPrivateKey();
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
                acme.accounts[presetKey].domains.push({
                    commonName: route.key,
                    altNames,
                });
                const accountPath = `${accountsPath}/${presetKey}`;
                const pathPrefix = `${accountPath}/host-${route.key}`
                if (!fs.existsSync(`${pathPrefix}.key`)) {
                    (
                        async function () {
                            const [routeKey, routeCSR] = await acmeClient.forge.createCsr({
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

        fs.writeFile(`${acmePath}/acme.json`, JSON.stringify(acme, null, 4), function (err) {
            callback && callback(err, true);
        });

    }
};
