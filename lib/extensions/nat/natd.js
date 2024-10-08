const fs = require('node:fs');
const async = require('async');

const config = require('../../configuration');
const logger = require('../../logger');
const interfaces = require('../../interfaces');

module.exports = {
    generate(callback) {
        async.parallel({
            interfaces(callback) {
                interfaces(function (err, interfaces) {
                    callback(err, interfaces);
                });
            },
        }, function (err, result) {
            let natd = '';
            natd += 'port 8668\n';

            logger.banner('Natd configuration generation');

            function findInterfaceByMac(mac) {
                for (let i = 0, till = result.interfaces.length; i < till; i++) {
                    const item = result.interfaces[i];
                    if (item.mac_address === mac) {
                        logger.log('debug', `interface found, mac: ${config._hostConfig.wan.mac}, interface: ${item.name}`);
                        return item.name;
                    }
                }
                logger.log('warn', `no interface found, mac: ${config._hostConfig.wan.mac}, using active interface: ${result.interfaces[0].name}`);
                return result.interfaces[0].name;
            }
            const networkInterface = findInterfaceByMac(config._hostConfig.wan.mac);
            natd += `interface ${networkInterface}\n`;

            Object.keys(config.servers).filter(function (vmKey) {
                return config.servers[vmKey].type && config.servers[vmKey].tcpShift && vmKey !== config._hostname && config.servers[vmKey].location === config._hostConfig.location;
            }).forEach(function (vmKey) {
                const vm = config.servers[vmKey];
                const { type } = vm;
                const ports = config.routing.types[type].level3;
                logger.log('debug', `'${vmKey}" host...`);
                Object.keys(ports).forEach(function (portSrc) {
                    const portTgt = ports[portSrc];
                    portSrc = (portSrc | 0) + (vm.tcpShift | 0);
                    const redirect = `redirect_port tcp ${config._hostConfig.wan.ip}:${portSrc} ${vm.lan.ip}:${portTgt}`;
                    logger.log('debug', `append rule: ${redirect}`);
                    natd += `${redirect}\n`;
                });
            });
            fs.writeFileSync(`${config._outputPath}/natd.conf`, natd, 'utf8');
            logger.log('info', 'natd.conf done!');

            callback && callback(null, true);
        });
    },
};
