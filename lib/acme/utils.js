const fs = require('fs');
const forge = require('node-forge');

const getHash = require('../utils/hash');
const { checkFileExists } = require('../utils/fs');

const M = {
    async checkExpired(path) {
        const files = await fs.promises.readdir(path);
        const arr = [];
        const result = [];
        for (const file of files) {
            if (!file.match(/\.crt$/)) {
                continue;
            }
            const crtPath = `${path}/${file}`;
            try {
                const remainingDays = await M.getRemainingDays(crtPath);
                if (remainingDays < 2) { 
                    result.push(`${crtPath} expired`);
                    arr.push(fs.promises.unlink(crtPath));
                    const keyPath = `${path}/${file.replace(/\.crt$/, '.key')}`;
                    arr.push(checkFileExists(keyPath).then((r) => r && fs.promises.unlink(keyPath)));
                    const csrPath = `${path}/${file.replace(/\.crt$/, '.csr')}`;
                    arr.push(checkFileExists(csrPath).then((r) => r && fs.promises.unlink(csrPath)));
                }
            } catch(e) {
                console.error(e);
            }
        }
        await Promise.all(arr);
        return result;
    },
    async getRemainingDays(path) {
        const crt = await fs.promises.readFile(path);
        const cert = forge.pki.certificateFromPem(crt);
        const expiry = cert.validity.notAfter;
        const remainingTime = expiry.getTime() - Date.now();
        return remainingTime / (1000 * 60 * 60 * 24);
    },
    async checkMigrate(pathPrefix) {
        const csrPath = `${pathPrefix}.csr`;
        if (await checkFileExists(csrPath)) {
            const csr = forge.pki.certificationRequestFromPem(await fs.promises.readFile(csrPath));
            const altNames = csr.getAttribute({
                name: 'extensionRequest'
            }).extensions.filter((x) => x.name === 'subjectAltName')[0].altNames.map((x) => x.value);
            const commonName = altNames.shift();
            const hash = getHash({
                commonName,
                altNames,
                keySize: csr.publicKey.n.bitLength(),
            });
            await fs.promises.rename(`${pathPrefix}.csr`, `${pathPrefix}-${hash}.csr`);
            if (await checkFileExists(`${pathPrefix}.crt`)) {
                await fs.promises.rename(`${pathPrefix}.crt`, `${pathPrefix}-${hash}.crt`);
            }
            if (await checkFileExists(`${pathPrefix}.key`)) {
                await fs.promises.rename(`${pathPrefix}.key`, `${pathPrefix}-${hash}.key`);
            }
            return true;
        }
        return false;
    },
};

module.exports = M;