

const fs = require('fs');

const config = require(`${__dirname}/../../configuration`);
const logger = require(`${__dirname}/../../logger`);

module.exports = {
    generate(callback) {
        let ipfw = '';

        logger.log('info', '======================================================================');
        logger.log('info', 'IPFW configutation generation');
        logger.log('info', '----------------------------------------------------------------------');

        let externalIp = config._hostConfig.wan.ip;
        const hostLocation = config.locations[config._hostConfig.location];
        if (typeof hostLocation.routing.external === 'string') {
            externalIp = hostLocation.routing.external;
        } else if (Array.isArray(hostLocation.routing.external) && hostLocation.routing.external[0]) {
            externalIp = hostLocation.routing.external[0];
        }

        const routers = [];
        Object.keys(config.servers).filter((vmKey) => {
            const vm = config.servers[vmKey];
            return vm.router && vm.tcpShift && vm.location === config._hostConfig.location;
        }).forEach((key) => {
            const vm = config.servers[key];

            const ip = key === config._hostname ? '127.0.0.1' : vm.lan.ip;

            const beaverPortSrc = 2 + (vm.tcpShift | 0);
            const beaverRedirect = ` \\\n    redirect_port tcp ${ip}:${1001} ${beaverPortSrc}`;
            logger.log('debug', 'append rule:', `redirect_port tcp ${ip}:${1001} ${beaverPortSrc}`);
            ipfw += beaverRedirect;

            const tincdPortSrc = 3 + (vm.tcpShift | 0);
            let tincdRedirect = ` \\\n    redirect_port tcp ${ip}:${655} ${tincdPortSrc}`;
            tincdRedirect += ` \\\n    redirect_port udp ${ip}:${655} ${tincdPortSrc}`;
            logger.log('debug', 'append rule:', `redirect_port tcp ${ip}:${655} ${tincdPortSrc}`);
            ipfw += tincdRedirect;
        });

        Object.keys(config.servers).filter((vmKey) => {
            const server = config.servers[vmKey];
            return server.type && server.tcpShift && server.location === config._hostConfig.location;
        }).forEach((vmKey) => {
            const server = config.servers[vmKey];
            const type = server.type;
            const ports = config.routing.types[type].level3;
            const ip = vmKey === config._hostname ? '127.0.0.1' : server.lan.ip;
            logger.log('debug', `'${vmKey}" host...`);
            Object.keys(ports).forEach((portSrc) => {
                const portTgt = ports[portSrc];
                let redirectType;
                const redirectSplit = portSrc.split('/');
                if (redirectSplit.length > 1) {
                    portSrc = redirectSplit[0];
                    redirectType = redirectSplit[1];
                }
                portSrc = (portSrc | 0) + (server.tcpShift | 0);
                let redirect = '';
                if (!redirectType || redirectType === 'tcp') {
                    redirect += ` \\\n    redirect_port tcp ${ip}:${portTgt} ${portSrc}`;
                }
                if (!redirectType || redirectType === 'udp') {
                    redirect += ` \\\n    redirect_port udp ${ip}:${portTgt} ${portSrc}`;
                }
                if (redirect) {
                    logger.log('debug', 'append rule:', `redirect_port tcp ${ip}:${portTgt} ${portSrc}`);
                    ipfw += redirect;
                }
            });
        });

        let output = '#!/bin/sh\n';
        output += 'fw="/sbin/ipfw"\n';

        output += `\${fw} nat 1 config ip ${externalIp} unreg_only${ipfw}\n`;

        output += '${fw} -f pipe flush\n';
        output += '${fw} -f queue flush\n';
        output += '${fw} -f table all flush\n';

        output += '\n\n';

        const local = {};
        const remote = {};

        {
            function addHost(item) {
                if (item.location === config._hostConfig.location) {
                    local[item.key] = item;
                } else {
                    remote[item.key] = item;
                }
            }

            Object.keys(config.servers).forEach((key) => {
                const item = config.servers[key];
                item.key = key;
                addHost(item);
            });
        }

        function findTapIp(locationKey) {
            const location = config.locations[locationKey];
            if (location.routing.tap && location.routing.tap.ip) {
                return location.routing.tap.ip;
            }
            const gateways = location.routing.gateway;
            console.log(`gateways: ${gateways.toString()}`);
            for (let i = 0, till = config._routers.length; i < till; i += 1) {
                const item = config._routers[i];
                if (item.location !== locationKey || item.router !== 'active' || !item.lan || !item.lan.ip || !item.tap || !item.tap.ip) {
                    continue;
                }
                console.log(`key: ${item.key}, tap: ${item.tap.ip}, lan: ${item.lan.ip}, found: ${gateways.indexOf(item.lan.ip) !== -1}`);
                return item.tap.ip;
            }
            console.log();
            return undefined;
        }

        // output += '${fw} table 5 flush              #  5: remote\n';
        Object.keys(remote).forEach((key) => {
            const item = remote[key];
            if (item.net && item.lan && item.lan.ip) {
                const tapIp = findTapIp(item.location);
                if (tapIp) {
                    output += `\${fw} table 5 add ${item.lan.ip} ${tapIp}    #    ${item.net}: ${key}\n`;
                }
            }
        });

        // output += '${fw} table 6 flush              #  6: local\n';
        Object.keys(local).forEach((key) => {
            const item = local[key];
            if (item.net && item.lan && item.lan.ip) {
                output += `\${fw} table 6 add ${item.lan.ip}    #    ${item.net}: ${key}\n`;
            }
        });

        output += '\n\n';

        output += '${fw} -f flush\n';

        output += '\n\n';

        output += '${fw} add 504 allow tcp from any to me dst-port 22,53,80,443,655 in\n';
        output += '${fw} add 505 allow udp from any to me dst-port 53,655 in\n';
        output += '${fw} add 506 allow ip from any to any via lo0\n';
        output += '${fw} add 507 allow tcp from me to not me out\n';
        output += '${fw} add 508 allow udp from me to not me out\n';

        output += '${fw} add 518 nat 1 ip from any to me in\n';
        output += '${fw} add 520 skipto 700 ip from 10.0.0.0/8 to 10.0.0.0/8\n';
        output += '${fw} add 522 skipto 700 ip from 172.16.0.0/12 to 172.16.0.0/12\n';
        output += '${fw} add 524 skipto 700 ip from 192.168.0.0/16 to 192.168.0.0/16\n';

        output += '${fw} add 610 nat 1 ip from 10.0.0.0/8 to any out\n';
        output += '${fw} add 620 nat 1 ip from 172.16.0.0/12 to any out\n';
        output += '${fw} add 630 nat 1 ip from 192.168.0.0/16 to any out\n';

        output += '\n\n';

        output += '${fw} add 800 deny icmp from me to \'table(6)\' icmptype 5 in\n';
        output += '${fw} add 800 fwd tablearg ip from \'table(6)\' to \'table(5)\' in\n';

        output += '\n\n';


        output += '${fw} add 900 allow ip from any to any\n';

        fs.writeFileSync(`${config._outputPath}/ipfw.sh`, output, 'UTF-8');

        logger.log('info', 'ipfw.sh done!');
        if (typeof callback === 'function') {
            callback(null, true);
        }
    },
};
