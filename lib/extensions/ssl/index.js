const fs = require('fs');
const path = require('path');

const openssl = require('../../openssl');
const config = require('../../configuration');
const logger = require('../../logger');

module.exports = {
    generate(callback) {
        const sslOn = config.routing.ssl && config.routing.ssl.defaultPreset && config.routing.ssl.presets;
        if (!sslOn) {
            callback();
            return;
        }

        logger.banner('Beaver SSL generation');

        const certPath = path.normalize(`${config._outputPath}/beaver-ssl`);
        if (!fs.existsSync(certPath)) {
            fs.mkdirSync(certPath);
        }

        openssl.generateRoot(certPath, (err) => {
            if (err) {
                callback && callback(err);
                return;
            }
            openssl.generate({
                certPath,
                appendHash: false,
            }, config._hostname, () => {
                logger.log('debug', 'beaver-ssl done...');
                callback(err, true);
            });
        });
    },
};
