const fs = require('node:fs');
const path = require('node:path');

const AbstractTransformer = require('../AbstractTransformer.js');
const { pathAsJSON } = require('../../utils/index.js');
const diff = require('../../utils/diff.js');
const getHash = require('../../utils/hash.js');

class CleanConfig extends AbstractTransformer {
    static systemic = true;

    constructor(o) {
        super(o);
        this.fileName = 'config-clean.json';
    }

    transform() {
        this.data = JSON.parse(this.o.config.parser.toSourceNonSecure());
        for (const item of Object.values(this.data?.monitoring?.notify || {})) {
            if (item.auth) {
                item.auth = `[REDACTED: ${getHash(item.auth)}]`;
            }
        }
        for (const item of Object.values(this.data?.services?.git?.repositories || {})) {
            if (item.repository) {
                item.repository = item.repository.replace(/(http[s]?:\/\/)([\w\.\-]+:[\w\.\-]+@)(.*)/, (m, p1, p2, p3) => `${p1}${p2 ? `[REDACTED: ${getHash(p2)}]@` : ''}${p3}`);
            }
            if (item.updateHook) {
                item.updateHook = item.updateHook.replace(/(.*)\/(.*)/, (m, p1, p2) => `${p1}/${p2 ? `[REDACTED: ${getHash(p2)}]` : ''}`);
            }
            if (item.updateHookSecret) {
                item.updateHookSecret = `[REDACTED: ${getHash(item.updateHookSecret)}]`;
            }
        }
        for (const authority of Object.values(this.data?.services?.pki?.authorities || {})) {
            for (const item of Object.values(authority?.external || {}))
            if (item.csr) {
                item.csr = `[REDACTED: ${getHash(item.csr)}]`;
            }
        }
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
