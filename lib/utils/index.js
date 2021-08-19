const fs = require('fs');

const M = {
    pathAsJSON: async function (path, onerror) {
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
};

module.exports = M;
