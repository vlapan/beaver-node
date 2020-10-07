const fs = require('fs');

const M = {
    async mkdirSafe(dir) {
        await fs.promises.mkdir(dir, {
            recursive: true,
        });
        return dir;
    },
    async checkFileExists(file) {
        return fs.promises.access(file, fs.constants.F_OK).then(() => true).catch(() => false);
    },
    async checkFilesExists(arr) {
        return Promise.all(arr.map(i => M.checkFileExists(i))).then(r => r.every(i => !!i));
    },
};

module.exports = M;