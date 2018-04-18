const fs = require('fs');
const async = require('async');

const config = require(`${__dirname}/../../configuration`);
const logger = require(`${__dirname}/../../logger`);

const interfaces = require(`${__dirname}/../../interfaces`);

module.exports = {
    generate(callback) {
        async.parallel({
            interfaces(callback) {
                interfaces((err, interfaces) => {
                    callback(err, interfaces);
                });
            },
        }, (err, result) => {
            let ipnat = '';

            logger.log('info', '======================================================================');
            logger.log('info', 'Ipnat configuration generation');
            logger.log('info', '----------------------------------------------------------------------');

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

            Object.keys(config.servers).filter(vmKey => config.servers[vmKey].type && config.servers[vmKey].tcpShift && vmKey !== config._hostname && config.servers[vmKey].location === config._hostConfig.location).forEach((vmKey) => {
                const vm = config.servers[vmKey];
                const type = vm.type;
                const ports = config.routing.types[type].level3;
                logger.log('debug', `'${vmKey}" host...`);
                Object.keys(ports).forEach((portSrc) => {
                    const portTgt = ports[portSrc];
                    portSrc = (portSrc | 0) + (vm.tcpShift | 0);
                    const redirect = `rdr ${networkInterface} ${config._hostConfig.wan.ip}/255.255.255.255 port ${portSrc} -> ${vm.lan.ip} port ${portTgt} round-robin`;
                    logger.log('debug', 'append rule:', redirect);
                    ipnat += `${redirect}\n`;
                });
            });
            fs.writeFileSync(`${config._outputPath}/ipnat.conf`, ipnat, 'UTF-8');
            logger.log('info', 'ipnat.conf done!');

            if (typeof callback === 'function') {
                callback(null, true);
            }
        });
    },
};
