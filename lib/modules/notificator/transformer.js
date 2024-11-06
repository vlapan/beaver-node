const fs = require('node:fs');
const path = require('node:path');
const AbstractTransformer = require('../AbstractTransformer');

class Notificator extends AbstractTransformer {
    static systemic = true;

    constructor(o) {
        super(o);
        this.list = [];
        this.fileName = 'notificator.json';
    }

    add(v) {
        if (typeof v.key === 'string') {
            const item = this.list.find((x) => x.key === v.key);
            if (typeof item === 'object') {
                if (v.date < item.date) {
                    this.list = this.list.filter((x) => x.key !== v.key);
                    this.list.push(v);
                }
            } else {
                this.list.push(v);
            }
        } else {
            this.list.push(v);
        }
    }

    postTransform() {
        this.list.sort((a, b) => a.key.localeCompare(b.key));
        this.debug(this.list.map((v) => `${v.date.toISOString()}: ${v.message}`).join('\n'));
        this.data = JSON.stringify(this.list, undefined, 4);
        return fs.promises.writeFile(path.join(this.o.config._outputPath, this.fileName), this.data);
    }

    postHook() {
        return fs.promises.writeFile(path.join(this.o.argv.home, this.fileName), this.data);
    }
}

module.exports = Notificator;
