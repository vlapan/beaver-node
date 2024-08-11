const fs = require('node:fs');

const config = require('../../configuration');
const logger = require('../../logger');

module.exports = {
    generate(callback) {
        let iptables = '';

        logger.banner('Iptables configuration generation');

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
                const redirect = `iptables -t nat -A PREROUTING -p tcp -d "${config._hostConfig.wan.ip}" --dport "${portSrc}" -j DNAT --to-destination "${vm.lan.ip}:${portTgt}"`;
                logger.log('debug', `append rule: ${redirect}`);
                iptables += `${redirect}\n`;
            });
        });
        fs.writeFileSync(`${config._outputPath}/iptables.dump`, iptables, 'UTF-8');
        logger.log('info', 'iptables.conf done!');

        callback && callback(null, true);
    },
};
