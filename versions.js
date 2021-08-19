const fs = require('fs');
const path = require('path');

class Versions {
    constructor() {
        this.versions = {};
    }

    async get(type) {
        const version = this.versions[type];
        if (version) {
            return version;
        } else if (typeof this[type] === 'function') {
            this.versions[type] = await this[type]();
            return this.versions[type];
        }
    }

    async beaver() {
        const json = await fs.promises.readFile(path.resolve(__dirname, 'package.json'));
        const data = JSON.parse(json);
        return typeof data === 'object' && data.version;
    }

    async yaumrc() {
        const json = await fs.promises.readFile(path.resolve(path.dirname(require.resolve('clean-yaumnrc')), 'package.json'));
        const data = JSON.parse(json);
        return typeof data === 'object' && data.version;
    }
}

module.exports = new Versions();
