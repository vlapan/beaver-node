const __dirname = import.meta.dirname;
import fs from 'node:fs';

import path from 'node:path';
import util from 'node:util';
import { exec as execRaw } from 'node:child_process';
const exec = util.promisify(execRaw);
import { pathAsJSON } from '../utils/index.js';
import { mkdirSafe } from '../utils/fs.js';

const M = {
    getTemplate: async () => {
        if (!M.template) {
            M.template = await fs.promises.readFile(path.resolve(__dirname, 'git.sh'), 'utf8');
        }
        return M.template;
    },
    pullCloneCommand: async (resource, name, url) => {
        const template = await M.getTemplate();
        const { stdout } = await exec(template, {
            env: {
                ...process.env,
                REPOS: resource,
                NAME: name,
                URL: url,
            }
        });
        const updates = stdout !== 'Already up to date.\n';
        if (stdout && updates) {
            console.log(stdout);
        }
        return updates;
    },
    async pullClone(repository, gitStaticPath) {
        const repositoriesPath = `${gitStaticPath}/repositories`;
        await mkdirSafe(repositoriesPath);

        const stateFile = `${gitStaticPath}/state.json`;
        const state = await pathAsJSON(stateFile, {});

        const configFile = `${gitStaticPath}/git-static.json`;
        const config = await pathAsJSON(configFile, {});

        if (!config.repositories || !config.repositories[repository]) {
            this.log(`${repository}: not found!`);
            return false;
        }

        this.log(`${repository}: updating...`);
        try {
            const updates = await M.pullCloneCommand(repositoriesPath, repository, config.repositories[repository].repository);
            state[repository] = new Date();
            this.log(`${repository}: ${updates === true ? 'updated' : 'no updates'}`);
            await fs.promises.writeFile(stateFile, JSON.stringify(state, undefined, 4));
            return updates;
        } catch (e) {
            this.log(`${repository}: ERROR: ${e}`);
            return;
        }
    },
};
export const getTemplate = M.getTemplate;
export const pullCloneCommand = M.pullCloneCommand;
export const name = M.name;
export const url = M.url;
export const gitStaticPath = M.gitStaticPath;

export default M;
