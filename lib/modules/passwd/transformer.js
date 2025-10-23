const fs = require('node:fs');
const path = require('node:path');

const AbstractTransformer = require('../AbstractTransformer');

class Passwd extends AbstractTransformer {
    static systemic = true;

    constructor(o) {
        super(o);
        this.fileName = 'passwd';
    }

    async transform() {
        this.debug('start');

        const result = [];

        for (const [key, user] of Object.entries(this.o.config.monitoring.notify)) {
            if (typeof user.pass === 'string') {
                result.push(`${key}:${user.pass}`);
            }
        }

        await fs.promises.writeFile(path.join(this.o.argv.home, this.fileName), `${result.join('\n')}\n`);
        this.debug(`${this.fileName}: done`);
    }
}

module.exports = Passwd;
