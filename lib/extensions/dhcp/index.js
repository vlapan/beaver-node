

const fs = require('fs');
const path = require('path');

const config = require(`${__dirname}/../../configuration`);
const logger = require(`${__dirname}/../../logger`);
const util = require('util');

// const isMacAddress = /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/i;

function compare(string1, string2) {
    const l = Math.min(string1.length, string2.length);
    for (let i = 0; i < l; i++) {
        if (string1.charAt(i) !== string2.charAt(i)) {
            return i;
        }
    }
    return l;
}

module.exports = {
    generate(callback) {
        logger.log('info', '======================================================================');
        logger.log('info', 'DHCP configutation generation');
        logger.log('info', '----------------------------------------------------------------------');

        const dhcpdHosts = path.normalize(`${config._outputPath}/dhcpd.hosts`);
        fs.openSync(dhcpdHosts, 'w');

        let output = '';
        const view = config.parser.location.provisionView;

        const lans = view.location.lans;
        if (lans) {
            for (const lan of lans.list) {
                // console.log(util.inspect(lan, { showHidden: true, depth: 2, colors: true }));
                output += `subnet ${lan.network} netmask ${lan.mask} {}\n`;
            }
        }

        for (const host of view.list) {
            logger.log('debug', `"${host.key}" host, mac: ${host.mac} = ip: ${host.ip}`);
            output += `host ${host.key} {`;
            output += ` option host-name "${host.host}";`;

            if (host.gateway) {
                if (true) { //iface.skipRouter !== true) {
                    output += ` option routers ${host.gateway};`;
                }
                output += ` option domain-name-servers ${host.gateway};`;
                if (host.routesAsClasslessString) {
                    output += ` option rfc3442-classless-static-routes ${host.routesAsClasslessString};`;
                    output += ` option ms-classless-static-routes ${host.routesAsClasslessString};`;
                }
            }

            output += ` hardware ethernet ${host.mac};`;
            output += ` fixed-address ${host.ip};`;
            output += ' }\n';
        }

        console.log('=======================================================');
        console.log('=' + output + '=');
        console.log('=======================================================');


        // function processItem(iface, server) {
        //     let key = `${server.key}_${iface.type}`;
        //     logger.log('debug', `"${key}" host, mac: ${iface.mac} = ip: ${iface.ip}`);
        //     let output = `host ${key} {`;
        //     output += ` option host-name "${server.key}";`;

        //     if (iface.type === 'lan') {
        //         const gateway = config.parser.location.findGatewayForClient(iface.ip);
        //         if (gateway) {
        //             if (iface.skipRouter !== true) {
        //                 output += ` option routers ${iface.gateway || gateway};`;
        //             }
        //             output += ` option domain-name-servers ${iface.gateway || gateway};`;
        //             const gw = gateway.replace(/\./gi, ', ');
        //             if (server.net) {
        //                 output += ' option rfc3442-classless-static-routes ';
        //                 let first = true;
        //                 for (let key of Object.keys(config._hosts)) {
        //                     const host = config._hosts[key];
        //                     if (host.lan && host.lan.ip && host.location !== server.location && host.net === server.net) {
        //                         output += `${first ? '' : ', '}32, ${host.lan.ip.replace(/\./gi, ', ')}, ${gw}`;
        //                         first = false;
        //                     }
        //                 }
        //                 if (iface.skipRouter !== true) {
        //                     if (!first) {
        //                         output += ', '
        //                     }
        //                     output += `0, ${(iface.gateway && iface.gateway.replace(/\./gi, ', ')) || gw};`;
        //                 } else {
        //                     output += ';';
        //                 }
        //             }
        //         }
        //     }

        //     output += ` hardware ethernet ${iface.mac};`;
        //     output += ` fixed-address ${iface.ip};`;
        //     output += ' }\n';
        //     return output;
        // }

        // for (const localServer of config.parser.location.servers.list) {
        //     const item = localServer.source;
        //     const wanExists = !!(item.wan && isMacAddress.exec(item.wan.mac));
        //     const lanExists = !!(item.lan && isMacAddress.exec(item.lan.mac));

        //     if (lanExists) {
        //         item.lan.skipRouter = wanExists;
        //         item.lan.type = 'lan';
        //         output += processItem(item.lan, item);
        //     }
        //     if (wanExists) {
        //         item.wan.skipRouter = true;
        //         item.wan.type = 'wan';
        //         output += processItem(item.wan, item);
        //     }
        // }

        fs.writeFileSync(dhcpdHosts, output, 'UTF-8');
        logger.log('info', `"${dhcpdHosts}" done`);

        callback && callback(null, true);
    },
};
