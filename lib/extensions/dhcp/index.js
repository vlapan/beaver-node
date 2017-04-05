

const fs = require('fs');
const path = require('path');

const config = require(`${__dirname}/../../configuration`);
const logger = require(`${__dirname}/../../logger`);

const isMacAddress = /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/i;

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

        const routers = [];
        var keys = Object.keys(config._routers);
        for (var i = 0, till = keys.length; i < till; i++) {
            var key = keys[i];
            var item = config._routers[key];
            if (item.location === config._hostConfig.location && item.router === 'active') {
                routers.push(item.lan.ip);
            }
        }

        const routing = config.parser.location.source.routing;
        let output = '';

        function processItem(iface, server) {
            let key = `${server.key}_${iface.type}`;
            logger.log('debug', `"${key}" host, mac: ${iface.mac} = ip: ${iface.ip}`);
            let output = `host ${key} {`;
            output += ` option host-name "${server.key}";`;

            if (iface.type === 'lan') {
                const gateway = config.parser.location.lan3.reduce((a, b) => {
                    const c = compare(iface.ip, b);
                    if (a.lcp < c) {
                        a.lcp = c;
                        a.value = b;
                    }
                    return a;
                }, {
                    lcp: 0,
                    value: '',
                }).value;
                if (gateway) {
                    if (iface.skipRouter !== true) {
                        output += ` option routers ${iface.gateway || gateway};`;
                    }
                    output += ` option domain-name-servers ${iface.gateway || gateway};`;
                    const gw = gateway.replace(/\./gi, ', ');
                    if (server.net) {
                        output += ' option rfc3442-classless-static-routes ';
                        let first = true;
                        for (let key of Object.keys(config._hosts)) {
                            const host = config._hosts[key];
                            if (host.lan && host.lan.ip && host.location !== server.location && host.net === server.net) {
                                output += `${first ? '' : ', '}32, ${host.lan.ip.replace(/\./gi, ', ')}, ${gw}`;
                                first = false;
                            }
                        }
                        if (iface.skipRouter !== true) {
                            if (!first) {
                                output += ', '
                            }
                            output += `0, ${(iface.gateway && iface.gateway.replace(/\./gi, ', ')) || gw};`;
                        } else {
                            output += ';';
                        }
                    }
                } else {
                    output += ` option domain-name-servers ${routers.join(', ')};`;
                }
            }

            output += ` hardware ethernet ${iface.mac};`;
            output += ` fixed-address ${iface.ip};`;
            output += ' }\n';
            return output;
        }

        var keys = Object.keys(config._hosts);
        for (var i = 0, till = keys.length; i < till; i++) {
            var key = keys[i];
            var item = config._hosts[key];

            if (item.location !== config._hostConfig.location) {
                continue;
            }

            const wanExists = !!(item.wan && isMacAddress.exec(item.wan.mac));
            const lanExists = !!(item.lan && isMacAddress.exec(item.lan.mac));

            if (lanExists) {
                item.lan.skipRouter = wanExists;
                item.lan.type = 'lan';
                output += processItem(item.lan, item);
            }
            if (wanExists) {
                item.wan.skipRouter = true;
                item.wan.type = 'wan';
                output += processItem(item.wan, item);
            }
        }

        fs.writeFileSync(dhcpdHosts, output, 'UTF-8');
        logger.log('info', `"${dhcpdHosts}" done`);

        callback && callback(null, true);
    },
};
