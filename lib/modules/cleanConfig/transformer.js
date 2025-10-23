const fs = require('node:fs');
const path = require('node:path');

const AbstractTransformer = require('../AbstractTransformer.js');
const { pathAsJSON } = require('../../utils/index.js');
const diff = require('../../utils/diff.js');
const structure = require('../../utils/structure.js');

class CleanConfig extends AbstractTransformer {
    static systemic = true;

    constructor(o) {
        super(o);
        this.fileName = 'config-clean.json';
    }

    transform() {
        this.data = JSON.parse(this.o.config.parser.toSourceNonSecure());
        structure.redact(this.data);
        return Promise.all([
            fs.promises.writeFile(path.join(this.o.config._outputPath, this.fileName), JSON.stringify(this.data, null, 4)),
            pathAsJSON(path.join(this.o.argv.home, this.fileName), false).then((v) => typeof v === 'object' && (this.changes = diff(v, this.data))),
        ]);
    }

    postHook() {
        return fs.promises.writeFile(path.join(this.o.argv.home, this.fileName), JSON.stringify(this.data, null, 4)).then(() => this.debug('non-secure version created'));
    }

    toMessage() {
        let message = '';
        if (Array.isArray(this.changes)) {
            if (this.changes.length > 0) {
                message += 'Diff:\n```\n' + this.changes.join('\n') + '\n```';
            } else {
                message += 'Diff: No changes';
            }
        } else {
            message += 'Diff: Fresh!';
        }
        return message;
    }
}

module.exports = CleanConfig;
