const fs = require('fs/promises');
const path = require('path');

module.exports = {
    async generate(o) {
        const debug = o.debug.extend('dhcp');
        debug('start');

        const dhcpdHosts = path.normalize(`${o.config._outputPath}/dhcpd.hosts`);

        let output = '';
        const view = o.config.parser.location.provisionView;

        const { lans } = view.location;
        if (lans) {
            for (const lan of lans.list) {
                // console.log(util.inspect(lan, { showHidden: true, depth: 2, colors: true }));
                output += `subnet ${lan.network} netmask ${lan.mask} {}\n`;
            }
        }

        for (const host of view.list) {
            debug(`${host.key}: mac=${host.mac}, ip=${host.ip}`);
            output += `host ${host.key} {`;
            output += ` option host-name "${host.host}";`;

            if (host.gateway) {
                if (true) { // iface.skipRouter !== true) {
                    output += ` option routers ${host.gateway};`;
                }
                output += ` option ntp-servers ${host.gateway};`;
            }
            if (host.resolver) {
                output += ` option domain-name-servers ${host.resolver};`;
            }
            if (host.routesAsClasslessString) {
                output += ` option rfc3442-classless-static-routes ${host.routesAsClasslessString};`;
                output += ` option ms-classless-static-routes ${host.routesAsClasslessString};`;
            }

            output += ` hardware ethernet ${host.mac};`;
            output += ` fixed-address ${host.ip};`;
            output += ' }\n';
        }

        await fs.writeFile(dhcpdHosts, output);
        debug('done');
    },
};
