import AbstractTransformer from '../AbstractTransformer.js';
import fs from 'node:fs';

import path from 'node:path';

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
export { Passwd };

export default Passwd;
