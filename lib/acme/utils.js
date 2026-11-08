import getHash from '../utils/hash.js';
import fs from 'node:fs';

import x509 from '@peculiar/x509';
import { certificateExpiration, NISTTOSECG } from '../utils/index.js';
import { checkFileExists } from '../utils/fs.js';
import { file } from '../utils/tpl.js';

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
        const { remainingDays } = certificateExpiration(crt);
        return remainingDays;
    },
    async checkMigrate(pathPrefix) {
        const csrPath = `${pathPrefix}.csr`;
        if (await checkFileExists(csrPath)) {
            const csrRaw = await fs.promises.readFile(csrPath, 'utf8');
            const dec = x509.PemConverter.decodeFirst(csrRaw);
            const csr = new x509.Pkcs10CertificateRequest(dec);
            const san = csr.extensions.find((x) => x instanceof x509.SubjectAlternativeNameExtension);
            const altNames = [];
            if (san) {
                for (const item of san.names.items) {
                    altNames.push(item.value);
                }
            }
            const commonName = altNames.shift();
            const hash = getHash({
                commonName,
                altNames,
                keySize: csr.publicKey.algorithm.modulusLength || NISTTOSECG[csr.publicKey.algorithm.namedCurve] || csr.publicKey.algorithm.namedCurve,
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
        if (data === undefined) {
            records.push('empty');
        } else if (typeof data === 'string') {
            records.push(data);
        } else if (Array.isArray(data)) {
            if (data.length > 0) {
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
            $TTL 15

            ; SOA Record
            @ IN SOA ${mname} ${rname} (
                ${serial}       ;serial
                15      ;refresh
                10      ;retry
                60480   ;expire
                15      ;minimum ttl
            )

            ${ns.map((x) => `@ IN NS ${x}.`).join('\n')}

            ${records.map((x) => `@            IN      TXT     "${x}"`).join('\n')}
            vendor       IN      TXT     beaver-l6route
        `;
    },
};
export const getZone = M.getZone;
export const mname = M.mname;
export const rname = M.rname;
export const ns = M.ns;
export const data = M.data;

export default M;
export const getRemainingDays = M.getRemainingDays;
export const checkExpired = M.checkExpired;
export const checkMigrate = M.checkMigrate;
