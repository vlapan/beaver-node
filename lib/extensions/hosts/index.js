

const fs = require('fs');
const path = require('path');

const Hoek = require('hoek');

const config = require(`${__dirname}/../../configuration`);
const logger = require(`${__dirname}/../../logger`);

module.exports = {
    generate(callback) {
        logger.log('info', '======================================================================');
        logger.log('info', 'HOSTS configutation generation');
        logger.log('info', '----------------------------------------------------------------------');


        const routers = [];
        config._routers.forEach((router) => {
            if (router.router === 'active') {
                routers.push(router);
            }
        });

        const domains = [];
        Object.keys(config.routing.domains).forEach((domainKey) => {
            const domain = config.routing.domains[domainKey];
            if (!domain.publish || domain.publish !== true) {
                return;
            }
            domain.key = domainKey.replace(/^./, '');
            domains.push(domain);
        });

        if (!domains.length) {
            if (typeof callback !== 'function') {
                callback('No domains provided.');
            }
            return;
        }

        const entriesLanMap = {};

        function add(type, key) {
            let zone = key;
            let domainFound = false;
            domains.forEach((domain) => {
                const re = new RegExp(`.${domain.key}$`, '');
                zone = zone.replace(re, () => {
                    domainFound = true;
                    return '';
                });
            });

            let item = config[type][key];
            if (!Array.isArray(item)) {
                item = [].concat(item);
            }
            let targets = [];
            const skip = item.length > 1;
            for (let i = 0, till = item.length; i < till; i += 1) {
                const target = item[i];

                if (typeof target !== 'object') {
                    continue;
                }

                const sameLocation = typeof target === 'object' && target.location === config._hostConfig.location;
                const localRoute = sameLocation && target.lan;

                if (localRoute) {
                    targets.push(target.lan.ip);
                } else if (target.wan && target.wan.ip) {
                    targets.push(target.wan.ip);
                }
            }

            targets = Hoek.unique(targets);
            if (!targets.length) {
                return;
            }
            entriesLanMap[zone] = {
                name: zone,
                ip: targets.join(' '),
                domainFound,
                skip,
            };
        }

        Object.keys(config._routes).forEach(add.bind(null, '_routes'));
        Object.keys(config.servers).forEach(add.bind(null, 'servers'));

        const entriesLan = Object.values(entriesLanMap);

        const outputFile = path.normalize(`${config._outputPath}/etc-hosts-generated`);

        function generateFile(entries) {
            fs.openSync(outputFile, 'w');

            let max = 0;
            const add = '# skip: '.length;
            entries.forEach((entry) => {
                if (max < entry.ip.length + (entry.skip ? add : 0)) {
                    max = entry.ip.length + (entry.skip ? add : 0);
                }
            });

            let output = '';
            entries.forEach((entry) => {
                let s = ' ';
                if (entry.ip.length + (entry.skip ? add : 0) < max) {
                    s += s.repeat(max - entry.ip.length - (entry.skip ? add : 0));
                }
                if (!entry.domainFound) {
                    return;
                }
                domains.forEach((domain) => {
                    output += `${(entry.skip ? '# skip: ' : '') + entry.ip + s + entry.name}.${domain.key}\n`;
                });
            });

            fs.writeFileSync(outputFile, output, 'UTF-8');
            logger.log('info', `"${outputFile}" done`);
        }

        generateFile(entriesLan);

        callback && callback(null, true);
    },
};
