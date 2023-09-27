const fs = require('fs');
const path = require('path');

const openssl = require('../../openssl');

const { certificateExpirationFile } = require('../../utils');
const { mkdirSafe, checkFileExists, findFile } = require('../../utils/fs');

module.exports = {
    id: 'beaver-ssl',
    async generate(o) {
        const sslOn = o.config.routing.ssl && o.config.routing.ssl.defaultPreset && o.config.routing.ssl.presets;
        if (!sslOn) {
            return;
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
        const authorities = o.config?.services?.pki?.authorities;
        if (typeof authorities === 'object') {
            const externalOutputPath = await mkdirSafe(path.normalize(`${o.argv.home}/ssl-external`));

            // Clean
            const certificatesFiles = await findFile(externalOutputPath, /^.*\.crt$/);
            const certificatesChecked = await Promise.all(certificatesFiles.map((x) => certificateExpirationFile(x)));
            const certificatesUnlink = [];
            for (const item of certificatesChecked) {
                const { file, expired, remainingDays } = item;
                if (expired) {
                    certificatesUnlink.push(Promise.all([
                        fs.promises.unlink(file),
                        // fs.promises.unlink(file.replace(/(\-[0-9a-z]{8})\.crt/, '.crt')),
                    ]).then(() => {
                        debug(`certificate cleanup: ${file}: expiry: valid for: ${remainingDays | 0} days, unlinked`);
                    }));
                } else {
                    debug(`certificate cleanup: ${file}: expiry: valid for: ${remainingDays | 0} days`);
                }
            }
            await Promise.all(certificatesUnlink);


            // Sign all
            for (const [authorityKey, authority] of Object.entries(authorities)) {
                const master = authority.master && [].concat(authority.master);
                if (master && !~master.indexOf(o.config._hostname)) {
                    continue;
                }
                for (const [externalKey, external] of Object.entries(authority.external)) {
                    const preset = openssl.getPreset(external.preset);
                    if (typeof preset !== 'object') {
                        continue;
                    }

                    const csr = external.csr;
                    if (typeof csr !== 'string') {
                        continue;
                    }

                    const authorityOutputPath = await mkdirSafe(path.normalize(`${externalOutputPath}/${authorityKey}`));
                    const presetHash = openssl.sslPresetHash(undefined, preset);
                    const prefixSimple = `${authorityOutputPath}/${externalKey}`;
                    const simpleCrt = `${prefixSimple}.crt`;
                    const prefixFull = `${prefixSimple}-${presetHash}`;
                    const fullCrt = `${prefixFull}.crt`;
                    if (await checkFileExists(fullCrt)) {
                        debug(`external(${authorityKey}/${externalKey}): certificate found`);
                    } else {
                        await openssl.signCSR(csr, preset, prefixFull);
                        debug(`external(${authorityKey}/${externalKey}): certificate generated`);
                    }
                    try {
                        await fs.promises.unlink(simpleCrt);
                    } catch (e) {}
                    try {
                        await fs.promises.symlink(`./${externalKey}-${presetHash}.crt`, simpleCrt);
                    } catch (e) {}
                }
            }
        }

        debug('done');
    },
};
