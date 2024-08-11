const fs = require('node:fs');
const path = require('node:path');

const util = require('node:util');
const exec = util.promisify(require('node:child_process').exec);

const { pathAsJSON } = require('../utils');
const { mkdirSafe } = require('../utils/fs');

const M = {
    getTemplate: async () => {
        if (!M.template) {
            M.template = await fs.promises.readFile(path.resolve(__dirname, 'git.sh'), 'utf-8');
        }
        return M.template;
    },
    pullCloneCommand: async (resource, name, url) => {
        const template = await M.getTemplate();
        const gitCommand = template.replace(/%\{([a-z0-9]+)\}/gi, (match, p1) => {
            switch (p1) {
                case 'path':
                    return resource;
                case 'name':
                    return name;
                case 'url':
                    return url;
                default:
                    break;
            }
            return false;
        });

        const { stdout } = await exec(gitCommand);
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
        const updates = await M.pullCloneCommand(repositoriesPath, repository, config.repositories[repository].repository);
        state[repository] = new Date();
        this.log(`${repository}: ${updates === true ? 'updated' : 'no updates'}`);

        await fs.promises.writeFile(stateFile, JSON.stringify(state, null, 4));

        return updates;
    },
};

module.exports = M;
