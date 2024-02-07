const fs = require('fs');
const forge = require('node-forge');
const { X509Certificate } = require('crypto');

const M = {
    isPlainObject: (x) => {
        return Object.prototype.toString.call(x) === '[object Object]';
    },
    pathAsJSON: async (path, onerror) => {
        try {
            return JSON.parse(await fs.promises.readFile(path));
        } catch (e) {
            if (typeof onerror !== 'undefined') {
                return onerror;
            } else {
                throw e;
            }
        }
    },
    toKebabCase: (s) => s.replace(/[A-Z]/g, (c, i) => i === 0 ? c.toLowerCase() : '-' + c.toLowerCase()),
    certificateExpiration: (data, expireBeforeDays = 30) => {
        try {
            const certificate = new X509Certificate(data);
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
        } catch (e) {
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
        const keys = forge.pki.rsa.generateKeyPair(4096);
        const cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
        const attrs = [{
            name: 'commonName',
            value: 'beaver',
        }];
        cert.setSubject(attrs);
        cert.setIssuer(attrs);
        cert.setExtensions([{
            name: 'basicConstraints',
            cA: false,
        }, {
            name: 'keyUsage',
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
        }, {
            name: 'extKeyUsage',
            serverAuth: true,
            clientAuth: true,
        }, {
            name: 'nsCertType',
            client: true,
            server: true,
        }, {
            name: 'subjectAltName',
            altNames: [{
                type: 2, // DNS
                value: 'beaver',
            }, {
                type: 7, // IP
                ip: '127.0.0.1',
            }],
        }, {
            name: 'subjectKeyIdentifier',
        }]);
        cert.sign(keys.privateKey);
        return {
            key: forge.pki.privateKeyToPem(keys.privateKey),
            cert: forge.pki.certificateToPem(cert),
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
    sleep: (v) => {
        const ms = typeof v === 'number' ? v : (typeof v === 'string' ? new Date(v) - new Date() : (v instanceof Date ? v - Date.now() : 0));
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
