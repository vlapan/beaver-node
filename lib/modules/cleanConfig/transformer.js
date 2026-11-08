import AbstractTransformer from '../AbstractTransformer.js';
import diff from '../../utils/diff.js';

import structure from '../../utils/structure.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathAsJSON } from '../../utils/index.js';

class CleanConfig extends AbstractTransformer {
    static systemic = true;

    constructor(o) {
        super(o);
        this.fileName = 'config-clean.json';
    }

    transform() {
        this.data = JSON.parse(this.o.config.parser.toSourceNonSecure());
        structure.redact(this.data);
        this.versionToStore = JSON.stringify(this.data, null, 4);
        return Promise.all([
            fs.promises.writeFile(path.join(this.o.config._outputPath, this.fileName), this.versionToStore),
            pathAsJSON(path.join(this.o.argv.home, this.fileName), false).then((v) => {
                if (typeof v === 'object') {
                    this.changes = diff(structure.reductPKI(v), structure.reductPKI(this.data));
                }
            }),
        ]);
    }

    postHook() {
        return fs.promises.writeFile(path.join(this.o.argv.home, this.fileName), this.versionToStore).then(() => this.debug('non-secure version created'));
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
export { CleanConfig };

export default CleanConfig;
