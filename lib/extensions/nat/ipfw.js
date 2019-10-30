

const fs = require('fs');

const config = require(`${__dirname}/../../configuration`);
const logger = require(`${__dirname}/../../logger`);

module.exports = {
    generate(callback) {
        logger.banner('IPFW configuration generation');

        const hostLocation = config.parser.location;
        const externalIp = hostLocation.wan3 || config._hostConfig.wan.ip;

        let output = '#!/bin/sh\n';
        let ipfw = '';

        const portForward = config.parser.buildPortForwardView();

        for(let key in portForward){
            const rec = portForward[key];
            const redirect = `redirect_port ${rec.type} ${rec.lclIp}:${rec.lclPort} ${rec.extPort} $(echo '' || comment ${rec.comment})`;
            logger.log('debug', `append rule: ${redirect}`);
            ipfw += ` \\\n    ` + redirect;
        }

        output += 'fw="/sbin/ipfw"\n';

        output += `\${fw} nat 1 config ip ${externalIp} unreg_only${ipfw}\n`;

        output += '${fw} -f pipe flush\n';
        output += '${fw} -f queue flush\n';
        output += '${fw} -f table all flush\n';

        output += '\n\n';

        const local = {};
        const remote = {};

        Object.keys(config.servers).forEach((key) => {
            const item = config.servers[key];
            item.key = key;
            if (item.location === config._hostConfig.location) {
                local[item.key] = item;
            } else {
                remote[item.key] = item;
            }
        });

        // output += '${fw} table 5 flush              #  5: remote\n';
        Object.keys(remote).forEach((key) => {
            const item = remote[key];
            if (item.net && item.lan && item.lan.ip) {
                const location = config.parser.locations.map[item.location];
                if (!location) {
                    return;
                }
                const tapIp = location.tap3smart[0];
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
        output += '${fw} add 509 allow ipv6 from me to any out\n';
        output += '${fw} add 510 allow ipv6 from any to me in\n';

        output += '${fw} add 518 nat 1 ip from any to ' + externalIp + ' in\n';
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
