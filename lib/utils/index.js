const fs = require('node:fs');
const crypto = require('node:crypto');
const x509 = require('@peculiar/x509');

const getHash = require('./hash');

// https://datatracker.ietf.org/doc/rfc4492/ Appendix A.  Equivalent Curves (Informative)
const SECGTONIST = {
    secp256r1: 'P-256',
    secp384r1: 'P-384',
    secp521r1: 'P-521',
};
const NISTTOSECG = {};
for (const [key, value] of Object.entries(SECGTONIST)) {
    NISTTOSECG[value] = key;
}

const subjectKeyMap = {
    CN: 'commonName',
    C: 'country',
    ST: 'state',
    L: 'locality',
    O: 'organization',
    OU: 'organizationUnit',
    E: 'emailAddress',
};

const M = {
    SECGTONIST,
    NISTTOSECG,
    isPlainObject: (x) => {
        return Object.prototype.toString.call(x) === '[object Object]';
    },
    mergeObject: (o, l = {}) => {
        for (const [k, v] of Object.entries(o)) {
            if (M.isPlainObject(v)) {
                if (!M.isPlainObject(l[k])) {
                    l[k] = {};
                }
                M.mergeObject(v, l[k]);
            } else {
                l[k] = v;
            }
        }
    },
    pathAsJSON: async (path, onerror) => {
        try {
            return JSON.parse(await fs.promises.readFile(path));
        } catch (e) {
            if (onerror === undefined) {
                throw e;
            } else {
                return onerror;
            }
        }
    },
    toKebabCase: (s) => s.replace(/[A-Z]/g, (c, i) => (i === 0 ? c.toLowerCase() : '-' + c.toLowerCase())),
    padDatePart: (part) => {
        return part.toString().padStart(2, '0');
    },
    compareHost: (host1, host2) => {
        const arr1 = host1.split('.').reverse();
        const arr2 = host2.split('.').reverse();
        for (const [key, item1] of Object.entries(arr1)) {
            const item2 = arr2[key] ?? '';
            const result = item1.localeCompare(item2);
            if (result !== 0) {
                return result;
            }
        }
        if (arr1.length === arr2.length) {
            return 0;
        }
        return arr1.length > arr2.length ? 1 : -1;
    },
    dateToString: (date) => {
        return `
            ${date.getUTCFullYear()}
            ${M.padDatePart(date.getUTCMonth() + 1)}
            ${M.padDatePart(date.getUTCDate())}
            ${M.padDatePart(date.getUTCHours())}
            ${M.padDatePart(date.getUTCMinutes())}
            ${M.padDatePart(date.getUTCSeconds())}
        `.replace(/[\n ]+/g, '');
    },
    convertSubjectToObject: (subjectString) => {
        if (!subjectString) {
            return {};
        }
        const subject = subjectString
            .split('/')
            .filter((x) => x && !x.startsWith('ext:'))
            .join(',');
        return Object.fromEntries(new x509.Name(subject).toJSON().map((x) => {
            const [key, value] = Object.entries(x).find(Boolean);
            return [subjectKeyMap[key], value[0]];
        }));
    },
    certificateExpiration: (data, expireBeforeDays = 30) => {
        try {
            const certificate = new crypto.X509Certificate(data);
            const expiry = new Date(certificate.validTo);
            const remainingTime = expiry.getTime() - Date.now();
            const remainingDays = remainingTime / (1000 * 60 * 60 * 24);
            const expired = remainingDays < expireBeforeDays;
            const expireDate = new Date(expiry.getTime() - (1000 * 60 * 60 * 24 * expireBeforeDays));
            return {
                expired,
                expiry,
                remainingDays,
                expireDate,
            };
        } catch {
            return {
                expired: true,
                expiry: new Date(),
                remainingDays: 0,
                expireDate: new Date(),
            };
        }
    },
    certificateExpirationFile: async (file, expireBeforeDays = 30) => {
        const data = await fs.promises.readFile(file);
        return {
            file,
            ...M.certificateExpiration(data, expireBeforeDays),
        };
    },
    createSelfSigned: async () => {
        const alg = {
            name: 'ECDSA',
            namedCurve: 'P-256',
            hash: 'SHA-256',
        };

        const keys = await crypto.subtle.generateKey(alg, false, ['sign', 'verify']);
        const cert = await x509.X509CertificateGenerator.createSelfSigned({
            name: 'CN=beaver',
            notBefore: new Date(),
            notAfter: new Date().setFullYear(new Date().getFullYear() + 1),
            keys: keys,
            extensions: [
                new x509.SubjectAlternativeNameExtension([{
                    type: 'dns',
                    value: 'beaver',
                }, {
                    type: 'ip',
                    value: '127.0.0.1',
                }]),
                new x509.BasicConstraintsExtension(true, 2, true),
                new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment | x509.KeyUsageFlags.nonRepudiation),
                new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
                new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth, x509.ExtendedKeyUsage.clientAuth]),
                await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
            ],
        });
        return {
            key: crypto.KeyObject.from(keys.privateKey).export({
                type: 'pkcs8',
                format: 'pem',
            }),
            cert: cert.toString('pem'),
        };
    },
    getCryptoAlgo: (keySize, signatureAlgorithm) => {
        if (typeof keySize === 'string') {
            return {
                name: 'ECDSA',
                namedCurve: NISTTOSECG[keySize] ? keySize : SECGTONIST[keySize],
                hash: signatureAlgorithm,
            }
        }
        return {
            name: 'RSASSA-PKCS1-v1_5',
            publicExponent: new Uint8Array([1, 0, 1]),
            modulusLength: keySize,
            hash: signatureAlgorithm,
        };
    },
    generateCertificate: async ({
        rootCA,
        issuerCrt,
        issuerKey,
        keySize = 'P-384',
        signatureAlgorithm = 'SHA-256',
        notBefore = new Date(),
        notAfter = new Date().setFullYear(new Date().getFullYear() + 1),
        subject = 'CN=beaver',
        san = [{
            type: 'dns',
            value: 'beaver',
        }, {
            type: 'ip',
            value: '127.0.0.1',
        }],
    }) => {
        if (!issuerCrt) {
            throw new Error('issuer certificate is required argument');
        }
        if (!issuerKey) {
            throw new Error('issuer private key is required argument');
        }
        if (issuerKey.startsWith('-----BEGIN RSA PRIVATE KEY-----')) {
            throw new Error('key is in pkcs1 format, please convert it to pkcs8: "openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in pkcs1.key -out pkcs8.key"');
        }
        const alg = M.getCryptoAlgo(keySize, signatureAlgorithm);
        const issuerCrtObj = new x509.X509Certificate(x509.PemConverter.decodeFirst(issuerCrt));
        const dataHash = getHash({
            alg,
            subject,
            san,
            issuerSubject: issuerCrtObj.subject,
            issuerKey,
            issuerCrtSignatureAlgorithm: {
                ...issuerCrtObj.publicKey.algorithm,
                ...issuerCrtObj.signatureAlgorithm,
            },
        }, 2);
        const authorityKeyIdentifierExtension = x509.AuthorityKeyIdentifierExtension.create(issuerCrtObj.publicKey);
        const issuerKeyCryptoKey = await crypto.subtle.importKey(
            'pkcs8',
            x509.PemConverter.decodeFirst(issuerKey),
            {
                ...issuerCrtObj.publicKey.algorithm,
                ...issuerCrtObj.signatureAlgorithm,
            },
            true,
            ['sign'],
        );
        issuerKeyCryptoKey.algorithm.hash = signatureAlgorithm;
        const keys = await crypto.subtle.generateKey(alg, false, ['sign', 'verify']);
        const cert = await x509.X509CertificateGenerator.create({
            // serialNumber: M.dateToString(new Date()) + dataHash,
            serialNumber: Date.now().toString(16),
            subject,
            issuer: issuerCrtObj.subject,
            notBefore,
            notAfter,
            signingAlgorithm: alg,
            signingKey: issuerKeyCryptoKey,
            publicKey: keys.publicKey,
            extensions: [
                await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
                new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment | x509.KeyUsageFlags.nonRepudiation),
                new x509.BasicConstraintsExtension(false),
                new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth, x509.ExtendedKeyUsage.clientAuth]),
                new x509.SubjectAlternativeNameExtension(san),
                await authorityKeyIdentifierExtension,
            ],
        });
        return {
            key: crypto.KeyObject.from(keys.privateKey).export({
                type: 'pkcs8',
                format: 'pem',
            }),
            crt: [
                cert.toString('pem'),
                issuerCrt.trim(),
                rootCA?.trim?.(),
            ].filter(Boolean).join('\n\n') + '\n',
        };
    },
    sleepBase: (ms) => {
        let resolve0, reject0;
        const promise = new Promise((resolve, reject) => {
            resolve0 = resolve;
            reject0 = reject;
        });
        promise.timer = setTimeout(resolve0, ms);
        promise.abort = (e) => {
            clearTimeout(promise.timer);
            reject0(e || new Error('abort'));
        };
        return promise;
    },
    timerMax: 2 ** 31 - 1,
    isValidDate: (d) => d instanceof Date && !Number.isNaN(d),
    parseMs: (v) => {
        if (typeof v === 'number') {
            return v;
        } else if (v instanceof Date) {
            return v - Date.now();
        } else if (typeof v === 'string') {
            const p = Number.parseInt(v, 10);
            if (p.toString() === v) {
                return p;
            }
            const d = new Date(v);
            return M.isValidDate(d) ? d - Date.now() : 0;
        } else {
            return 0;
        }
    },
    sleep: (v) => {
        const ms = M.parseMs(v);
        if (ms < 0) {
            return false;
        }
        let resolve0, reject0;
        const promise = new Promise((resolve, reject) => {
            resolve0 = resolve;
            reject0 = reject;
        });
        let s;
        let a = ms;
        (async () => {
            for (;;) {
                if (a <= 0) {
                    resolve0();
                    return;
                }
                const b = a > M.timerMax ? M.timerMax : a;
                a -= b;
                s = M.sleepBase(b);
                try {
                    await s;
                } catch (e) {
                    reject0(e || new Error('abort'));
                    return;
                }
            }
        })();
        promise.abort = (e) => {
            s && s.abort(e);
        };
        return promise;
    },
    async retryable(cb, options) {
        const opts = {
            maxAttempts: options.maxAttempts || 5,
            attempt: 1,
            sleepMs: 144,
            sleepTotal: 0,
        };
        const debug = options.debug;
        let failed = false;
        for (;;) {
            try {
                const result = await cb({
                    ...options,
                    attempt: opts.attempt,
                });
                if (failed === true && typeof debug === 'function') {
                    debug(
                        `retryable.success[${Object.entries(opts)
                            .map((x) => `${x[0]}=${x[1]}`)
                            .join(', ')}]`,
                    );
                }
                return result;
            } catch (e) {
                failed = true;
                opts.sleepTotal += opts.sleepMs;
                if (typeof debug === 'function') {
                    debug(
                        `retryable.failed["${e.message}", ${Object.entries(opts)
                            .map((x) => `${x[0]}=${x[1]}`)
                            .join(', ')}]`,
                    );
                }
                if (opts.attempt < opts.maxAttempts) {
                    await M.sleep(opts.sleepMs);
                    opts.attempt += 1;
                    opts.sleepMs = Math.round(opts.sleepMs * 1.618);
                } else {
                    throw new Error(`retryable: max attempts reached, error: "${e.message}"`);
                }
            }
        }
    },
    endsWithAny(k, a) {
        for (const v of a) {
            if (k.endsWith(v)) {
                return true;
            }
        }
        return false;
    },
};

module.exports = M;
