const fs = require('fs');
const { X509Certificate } = require('crypto');

const M = {
    pathAsJSON: async (path, onerror) => {
        try {
            return JSON.parse(await fs.promises.readFile(path));
        } catch (e) {
            if (onerror) {
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
};

module.exports = M;
