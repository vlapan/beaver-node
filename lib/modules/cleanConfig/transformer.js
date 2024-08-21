const fs = require('node:fs');
const path = require('node:path');

const AbstractTransformer = require('../AbstractTransformer.js');
const { pathAsJSON } = require('../../utils/index.js');
const diff = require('../../utils/diff.js');

class CleanConfig extends AbstractTransformer {
    static systemic = true;

    constructor(o) {
        super(o);
        this.fileName = 'config-clean.json';
    }

    transform() {
        this.data = this.o.config.parser.toSourceNonSecure();
        return Promise.all([
            fs.promises.writeFile(path.join(this.o.config._outputPath, this.fileName), this.data),
            pathAsJSON(path.join(this.o.argv.home, this.fileName), false).then((v) => Array.isArray(v) || (this.changes = diff(v, JSON.parse(this.data)))),
        ]);
    }

    postHook() {
        return fs.promises.writeFile(path.join(this.o.argv.home, this.fileName), this.data).then(() => this.debug('non-secure version created'));
    }

    toMessage() {
        let message = '';
        if (Array.isArray(this.changes)) {
            if (this.changes.length > 0) {
                message += 'Diff:\n```\n' + this.changes.join('\n') + '\n```';
            } else {
                message += 'No changes';
            }
        } else {
            message += 'Fresh!';
        }
        return message;
    }
}

module.exports = CleanConfig;
