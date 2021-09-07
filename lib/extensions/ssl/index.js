const fs = require('fs');
const path = require('path');
const util = require('util');

const sslUtil = require('ssl-utils');
const checkCertificateExpiration = util.promisify(sslUtil.checkCertificateExpiration);

const argv = require('../../argv');
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

        // MAIN-SSL
        const certPath = await mkdirSafe(path.normalize(`${o.config._outputPath}/${this.id}`));
        await openssl.generateRoot(certPath);
        await openssl.generate({
            certPath,
            appendHash: false,
        }, o.config._hostname);

        // EXTERNAL-SSL
        const external = o.config.routing.ssl.external;
        if (typeof external === 'object') {
            const externalOutputPath = await mkdirSafe(path.normalize(`${argv.home}/ssl-external`));

            // Clean
            for (const file of await fs.promises.readdir(`${externalOutputPath}`)) {
                if (!file.match(/^external-.*\.crt$/)) {
                    continue;
                }
                const filePath = `${externalOutputPath}/${file}`;
                const fileData = await fs.promises.readFile(filePath);
                const expiry = await checkCertificateExpiration(fileData);
                const remainingTime = expiry.getTime() - Date.now();
                const remainingDays = remainingTime / (1000 * 60 * 60 * 24);
                const expired = remainingDays < 30;
                debug(`certificate: ${file}: expiry: valid for: ${remainingDays | 0} days`);
                if (expired) {
                    await fs.unlink(filePath);
                    debug(`certificate: ${file}: expiry: unlink: done.`);
                }
            }

            // Sign all
            for (const [key, obj] of Object.entries(external)) {
                const master = obj.master && [].concat(obj.master);
                debug(`external: key ${key}${master ? `, master ${master}` : ', no master'}`);
                if (master && !~master.indexOf(o.config._hostname)) {
                    continue;
                }

                const preset = openssl.getPreset(obj.preset);
                if (typeof preset !== 'object') {
                    continue;
                }

                const csr = obj.csr;
                if (typeof csr !== 'string') {
                    continue;
                }

                const presetHash = openssl.sslPresetHash(undefined, preset);
                const prefixLink = `${externalOutputPath}/${key}`;
                const prefixFull = `${prefixLink}-${presetHash}`;
                const prefixSimple = `${externalOutputPath}/${key}`;
                await openssl.signCSR(csr, preset, prefixFull);
                try {
                    await fs.promises.link(`${prefixFull}.crt`, prefixSimple);
                } catch (e) {}
            }
        }

        debug('done');
    },
    getExternalLocations(config) {
        const locations = {};
        for (const [key, obj] of Object.entries(config.routing.ssl.external)) {
            const master = obj.master && [].concat(obj.master);
            locations[key] = {
                local: !master || master.includes(config._hostname),
                master: master && master.map((key) => config.parser.servers.map[key]).filter((v) => !!v),
            };
        }
        return locations;
    },
};
