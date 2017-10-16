

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
            domain.key = domainKey.replace(/^\./, '');
            domains.push(domain);
        });

        if (!domains.length) {
            if (typeof callback !== 'function') {
                callback('No domains provided.');
            }
            return;
        }

        const entriesLanMap = {};

        // let viewResult = '';
        const entriesLan = {};
        const viewSource = config.parser.buildDnsView(config.parser.location.lans).toSourceObject();
        //console.log(">>>>>>>>>>>>>>>> ", JSON.stringify(viewSource, null, 4));
        for (const [domainKey, domain] of Object.entries(viewSource)) {
            for (const [host, ip] of Object.entries((domain.dns || {}).A || {})) {
                const fqdn = host.endsWith('.') ? host.slice(0, -1) : host + domainKey;
                ip.forEach((ip) => {
                    (entriesLan[fqdn] || (entriesLan[fqdn] = {}))[ip] = true;
                });
            }
        }

        let max = 0;
        const add = '# skip: '.length;
        for (const [fqdn, ips] of Object.entries(entriesLan)) {
            const skip = Object.keys(ips).length !== 1;
            for (const ip of Object.keys(ips)) {
                const len = ip.length  + (skip ? add : 0);
                if (max < len) {
                    max = len;
                }
            }
        }

        // more padding
        max += 58;

        let output = '';
        for (const [fqdn, ips] of Object.entries(entriesLan)) {
            const skip = Object.keys(ips).length !== 1;
            for (const ip of Object.keys(ips)) {
                let s = ' ';
                const len = ip.length  + (skip ? add : 0);
                if (len < max) {
                    s += s.repeat(max - len);
                }
                output += `${(skip ? '# skip: ' : '') + ip + s + fqdn}\n`;
            }
        }

        const outputFile = path.normalize(`${config._outputPath}/etc-hosts-generated`);
        fs.writeFileSync(outputFile, output, 'UTF-8');
        logger.log('info', `"${outputFile}" done`);

        callback && callback(null, true);
    },
};
