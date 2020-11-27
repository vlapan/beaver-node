const fs = require('fs/promises');
const path = require('path');

const config = require('../../configuration');

module.exports = {
    async generate(o) {
        const debug = o.debug.extend('hosts');
        debug('start');

        const entriesLan = config.parser.buildHostsView();

        let max = 0;
        const add = '# skip: '.length;
        for (const [fqdn, ips] of Object.entries(entriesLan)) {
            const skip = ips.length !== 1;
            for (const ip of ips) {
                const len = ip.length + (skip ? add : 0);
                if (max < len) {
                    max = len;
                }
            }
        }

        // more padding
        max += 58;

        let output = '';
        for (const [fqdn, ips] of Object.entries(entriesLan)) {
            const skip = ips.length !== 1;
            for (const ip of ips) {
                let s = ' ';
                const len = ip.length + (skip ? add : 0);
                if (len < max) {
                    s += s.repeat(max - len);
                }
                output += `${(skip ? '# skip: ' : '') + ip + s + fqdn}\n`;
            }
        }

        const outputFile = path.normalize(`${config._outputPath}/etc-hosts-generated`);
        await fs.writeFile(outputFile, output);
        debug(`${outputFile}: done`);
    },
};
