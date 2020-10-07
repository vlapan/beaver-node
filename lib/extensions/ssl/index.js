const path = require('path');

const openssl = require('../../openssl');

const { mkdirSafe } = require('../../utils/fs');

module.exports = {
    id: 'beaver-ssl',
    async generate(o) {
        const sslOn = o.config.routing.ssl && o.config.routing.ssl.defaultPreset && o.config.routing.ssl.presets;
        if (!sslOn) {
            return Promise.resolve();
        }

        const debug = o.debug.extend(this.id);
        debug('start');

        const certPath = await mkdirSafe(path.normalize(`${o.config._outputPath}/${this.id}`));
        await openssl.generateRoot(certPath);
        await openssl.generate({
            certPath,
            appendHash: false,
        }, o.config._hostname);

        debug('done');
        return Promise.resolve();
    },
};
