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
        const { default: packageData } = await import('./package.json', { with: { type: 'json' } });
        return typeof packageData === 'object' && packageData.version;
    }

    async yaumnrc() {
        const { default: yaumnrcData } = await import('clean-yaumnrc/package.json', { with: { type: 'json' } });
        return typeof yaumnrcData === 'object' && yaumnrcData.version;
    }
}

const moduleExports = new Versions();

export default moduleExports;
