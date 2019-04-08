const fs = require('fs');
const path = require('path');

const openssl = require(`${__dirname}/../../openssl`);
const config = require(`${__dirname}/../../configuration`);
const logger = require(`${__dirname}/../../logger`);

module.exports = {
    generate(callback) {
        const sslOn = config.routing.ssl && config.routing.ssl.defaultPreset && config.routing.ssl.presets;
        if (!sslOn) {
            callback();
            return;
        }

        logger.log('info', '======================================================================');
        logger.log('info', 'Beaver SSL generation');
        logger.log('info', '----------------------------------------------------------------------');

        const certPath = path.normalize(`${config._outputPath}/beaver-ssl`);
        if (!fs.existsSync(certPath)) {
            fs.mkdirSync(certPath);
        }

        openssl.generateRoot(certPath, (err) => {
            if (err) {
                callback && callback(err);
                return;
            }
            openssl.generate(certPath, config._hostname, () => {
                logger.log('debug', 'beaver-ssl done...');
                callback(err, true);
            });
        });
    },
};
