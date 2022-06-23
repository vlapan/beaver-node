const fs = require('fs');
const forge = require('node-forge');
const { X509Certificate } = require('crypto');

const M = {
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
    certificateExpiration: async (file) => {
        const fileData = await fs.promises.readFile(file);
        try {
            const certificate = new X509Certificate(fileData);
            const expiry = new Date(certificate.validTo);
            const remainingTime = expiry.getTime() - Date.now();
            const remainingDays = remainingTime / (1000 * 60 * 60 * 24);
            const expired = remainingDays < 30;
            return {
                file,
                expired,
                expiry,
                remainingDays,
            };
        } catch (e) {
            return {
                file,
                expired: true,
                expiry: new Date(),
                remainingDays: 0,
            };
        }
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
};

module.exports = M;
