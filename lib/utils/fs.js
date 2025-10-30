const fs = require('node:fs');

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
    async modeRX(path) {
        return fs.promises.access(path, fs.constants.R_OK | fs.constants.X_OK).then(() => true).catch(() => false);
    },
    async findFile(path, pattern, recursive = true, filter) {
        const result = [];
        const promises = [];
        const dir = await fs.promises.opendir(path);
        if (typeof filter !== 'function') {
            filter = (dirent) => dirent.isFile();
        }
        for await (const dirent of dir) {
            const item = `${path}/${dirent.name}`;
            if (recursive && dirent.isDirectory()) {
                promises.push(M.findFile(item, pattern));
            }
            if (!filter(dirent) || (pattern instanceof RegExp && pattern.test(dirent.name) === false)) {
                continue;
            }
            if (typeof pattern === 'function') {
                const result = await pattern(item);
                if (result === false) {
                    continue;
                }
            }
            result.push(item);
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
