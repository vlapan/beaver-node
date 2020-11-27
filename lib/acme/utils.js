const fs = require('fs');
const forge = require('node-forge');

const getHash = require('../utils/hash');
const { checkFileExists } = require('../utils/fs');
const { file } = require('../utils/tpl');

const M = {
    async checkExpired(path) {
        const files = await fs.promises.readdir(path);
        const arr = [];
        const result = [];
        for (const item of files) {
            if (!item.match(/\.crt$/)) {
                continue;
            }
            const crtPath = `${path}/${item}`;
            try {
                const remainingDays = await M.getRemainingDays(crtPath);
                if (remainingDays < 2) {
                    result.push(`${crtPath} expired`);
                    arr.push(fs.promises.unlink(crtPath));
                    const keyPath = `${path}/${item.replace(/\.crt$/, '.key')}`;
                    arr.push(checkFileExists(keyPath).then((r) => r && fs.promises.unlink(keyPath)));
                    const csrPath = `${path}/${item.replace(/\.crt$/, '.csr')}`;
                    arr.push(checkFileExists(csrPath).then((r) => r && fs.promises.unlink(csrPath)));
                }
            } catch (e) {
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
                name: 'extensionRequest',
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
    getZone(zone, mname, rname, ns, data) {
        const date = new Date();
        const serial = date.getTime() / 1000 | 0;
        const records = [];
        if (typeof data === 'undefined') {
            records.push('empty');
        } else if (typeof data === 'string') {
            records.push(data);
        } else if (Array.isArray(data)) {
            if (data.length) {
                data.forEach((x) => {
                    records.push(x);
                });
            } else {
                records.push('empty');
            }
        }
        return file`
            ; Zone: ${zone}.
            ; Exported  (yyyy-mm-ddThh:mm:ss.sssZ): ${date.toISOString()}

            $ORIGIN ${zone}.
            $TTL 30

            ; SOA Record
            @ IN SOA ${mname} ${rname} (
                ${serial}       ;serial
                30      ;refresh
                15      ;retry
                60480   ;expire
                60      ;minimum ttl
            )

            ${ns.map((x) => `@ IN NS ${x}.`).join('\n')}

            ${records.map((x) => `@            IN      TXT     "${x}"`).join('\n')}
            vendor       IN      TXT     beaver-l6route
        `;
    },
};

module.exports = M;
