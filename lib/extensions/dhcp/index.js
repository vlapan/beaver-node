const fs = require('node:fs/promises');
const path = require('node:path');

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


        const domainList = typeof o.config.routing.domains === 'object' && Object.keys(o.config.routing.domains).sort((a, b) => {
            return b.split('.').length - a.split('.').length;
        });
        function getDomain(host) {
            if (!domainList) {
                return false;
            }
            for (const domain of domainList) {
                if (host.host.endsWith(domain)) {
                    return domain.replace(/^\./, '');
                }
            }
            return false;
        }


        for (const host of view.list) {
            debug(`${host.key}: mac=${host.mac}, ip=${host.ip}`);
            output += `host ${host.key} {`;
            output += ` option host-name "${host.host}";`;

            const domainName = getDomain(host);
            if (domainName) {
                output += ` option domain-name "${domainName}";`;
            }

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
