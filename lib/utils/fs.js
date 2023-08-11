const fs = require('fs');

const M = {
    async mkdirSafe(dir) {
        await fs.promises.mkdir(dir, {
            recursive: true,
        });
        return dir;
    },
    async checkDirectoryExists(path) {
        return fs.promises.stat(path).then(v => v.isDirectory()).catch(() => false);
    },
    async checkFileExists(path) {
        return fs.promises.access(path, fs.constants.F_OK).then(() => true).catch(() => false);
    },
    async checkFilesExists(arr) {
        return Promise.all(arr.map(i => M.checkFileExists(i))).then(r => r.every(i => !!i));
    },
    async findFile(path, pattern, recursive = true) {
        const result = [];
        const promises = [];
        const dir = await fs.promises.opendir(path);
        for await (const dirent of dir) {
            if (recursive && dirent.isDirectory()) {
                promises.push(M.findFile(`${path}/${dirent.name}`, pattern));
            }
            if (!dirent.isFile() || !dirent.name.match(pattern)) {
                continue;
            }
            result.push(`${path}/${dirent.name}`);
        }
        for (const promiseResult of await Promise.all(promises)) {
            for (const item of promiseResult) {
                result.push(item);
            }
        }
        return result;
    },
};

module.exports = M;
