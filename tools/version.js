import fs from 'node:fs/promises';
import util from 'node:util';
import { exec as execRaw } from 'node:child_process';

const exec = util.promisify(execRaw);

import inc from 'semver/functions/inc.js';

async function getGitLatestTag() {
    const execResult = await exec('git for-each-ref refs/tags --sort=-v:refname --format "%(refname:short)" --count=1');
    if (execResult.stderr) {
        throw execResult.stderr;
    }
    const tag = execResult.stdout.trim().replace(/^[a-z]+/i, '');
    if (!tag) {
        throw new Error('no git tag found!');
    }
    return tag;
}

(async function () {
    try {
        const path = './package.json';
        const json = await fs.readFile(path);
        const data = JSON.parse(json);
        const version = process.argv.includes('--use-package') ? data.version : await getGitLatestTag();
        if (process.argv.includes('--bump')) {
            data.version = inc(version, 'patch');
            if (!process.argv.includes('--dry')) {
                await fs.writeFile(path, `${JSON.stringify(data, undefined, 2)}\n`);
            }
        }
        console.log(data.version);
    } catch (error) {
        console.error(error);
        throw error;
    }
})();
