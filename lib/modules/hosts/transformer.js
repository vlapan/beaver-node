const fs = require('node:fs');
const AbstractTransformer = require('../AbstractTransformer');

class Hosts extends AbstractTransformer {
    constructor(o) {
        super(o);
        this.file = `${o.config._outputPath}/etc-hosts-generated`;
    }

    async transform() {
        this.debug('start');

        const entriesLan = this.o.config.parser.buildHostsView();

        let max = 0;
        const skipTxt = '# skip: ';
        const add = skipTxt.length;
        for (const [, ips] of Object.entries(entriesLan)) {
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
                output += `${(skip ? skipTxt : '') + ip + s + fqdn}\n`;
            }
        }

        await fs.promises.writeFile(this.file, output);
        this.debug(`${this.file}: done`);
    }
}

module.exports = Hosts;