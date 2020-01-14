const fs = require('fs');
const path = require('path');

const config = require('../../configuration');
const logger = require('../../logger');

module.exports = {
    generate(callback) {
        logger.banner('HOSTS configuration generation');

        const entriesLan = config.parser.buildHostsView();

        let max = 0;
        const add = '# skip: '.length;
        for (const [fqdn, ips] of Object.entries(entriesLan)) {
            const skip = ips.length !== 1;
            for (const ip of ips) {
                const len = ip.length  + (skip ? add : 0);
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
                const len = ip.length  + (skip ? add : 0);
                if (len < max) {
                    s += s.repeat(max - len);
                }
                output += `${(skip ? '# skip: ' : '') + ip + s + fqdn}\n`;
            }
        }

        const outputFile = path.normalize(`${config._outputPath}/etc-hosts-generated`);
        fs.writeFileSync(outputFile, output, 'UTF-8');
        logger.log('info', `"${outputFile}" done`);

        callback && callback(null, true);
    },
};
