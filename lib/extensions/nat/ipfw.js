const fs = require('fs');

const config = require('../../configuration');
const logger = require('../../logger');

module.exports = {
    generate(callback) {
        logger.banner('IPFW configuration generation');

        const hostLocation = config.parser.location;
        const externalIp = hostLocation.wan3 || config._hostConfig.wan.ip;
        const externalIp6 = hostLocation.wan36;

        let output = '#!/bin/sh\n';
        let ipfw = '';

        const portForward = config.parser.buildPortForwardView();

        for (const key of Object.keys(portForward)) {
            const rec = portForward[key];
            const redirect = `redirect_port ${rec.type} ${rec.lclIp}:${rec.lclPort} ${rec.extPort} $(true || comment ${rec.comment})`;
            logger.log('debug', `append rule: ${redirect}`);
            ipfw += ` \\\n    ${redirect}`;
        }

        output += 'fw="/sbin/ipfw"\n';

        output += `\${fw} nat 1 config ip ${externalIp} unreg_only${ipfw}\n`;

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

        output += '${fw} -f table 5 flush || true             #  5: remote\n';
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

        output += '${fw} -f table 6 flush || true             #  6: local\n';
        Object.keys(local).forEach((key) => {
            const item = local[key];
            if (item.net && item.lan && item.lan.ip) {
                output += `\${fw} table 6 add ${item.lan.ip}    #    ${item.net}: ${key}\n`;
            }
        });

        output += '\n\n';

        const { iface } = config.parser.server.source.wan;

        output += '${fw} delete 504 || true\n';
        output += '${fw} add 504 allow tcp from any to me dst-port 80,443 in // public http \n';
        output += '${fw} add 504 allow tcp from any to me dst-port 22,27 in // management ssh \n';
        output += '${fw} add 504 count tcp from any to me dst-port 53 in // tcp dns \n';
        output += '${fw} add 504 count ip from any to me dst-port 655 in // tincd \n';
        output += '${fw} add 504 allow ip from any to me dst-port 53,655 in // dns + tincd \n';

        output += '${fw} delete 506 || true\n';
        output += '${fw} add 506 allow ip from any to any via lo0 // local internal \n';

        output += '${fw} delete 508 || true\n';
        output += '${fw} add 508 count ip6 from me to not me out // ipv6 of all \n';
        output += '${fw} add 508 count udp from me to not me out // udp of all \n';
        output += '${fw} add 508 allow ip from me to not me out // all outgoing blindly allowed \n';

        output += '${fw} delete 518 || true\n';
        output += `\${fw} add 518 nat 1 ip from any to ${externalIp} in${iface ? ' recv ' + iface : ''} // incoming nat \n`;
        output += '${fw} add 518 skipto 700 ip from 10.0.0.0/8 to 10.0.0.0/8 // local traffic \n';
        output += '${fw} add 518 skipto 700 ip from 172.16.0.0/12 to 172.16.0.0/12 // local traffic \n';
        output += '${fw} add 518 skipto 700 ip from 192.168.0.0/16 to 192.168.0.0/16 // local traffic \n';

        output += '${fw} delete 608 || true\n';

        output += `\${fw} add 608 nat 1 ip from 10.0.0.0/8 to any out${iface ? ' xmit ' + iface : ''} // outgoing nat \n`;
        output += `\${fw} add 608 nat 1 ip from 172.16.0.0/12 to any out${iface ? ' xmit ' + iface : ''} // outgoing nat \n`;
        output += `\${fw} add 608 nat 1 ip from 192.168.0.0/16 to any out${iface ? ' xmit ' + iface : ''} // outgoing nat \n`;

        output += '\n\n';

        output += '${fw} delete 800 || true\n';
        output += '${fw} add 800 deny icmp from me to \'table(6)\' icmptype 5 in // block redirects for tincd \n';
        output += '${fw} add 800 fwd tablearg ip from \'table(6)\' to \'table(5)\' in // tincd forward \n';

        output += '\n\n';


        output += '${fw} delete 900 || true\n';
        output += '${fw} add 900 count ip6 from any to any // ipv6 of all \n';
        output += '${fw} add 900 count ip from not me to me in // incoming of all \n';
        output += '${fw} add 900 allow ip from any to any // all traffic blindly allowed \n';

        fs.writeFileSync(`${config._outputPath}/ipfw.sh`, output, 'UTF-8');

        logger.log('info', 'ipfw.sh done!');
        if (typeof callback === 'function') {
            callback(null, true);
        }
    },
};
