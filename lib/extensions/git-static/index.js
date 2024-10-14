const fs = require('node:fs/promises');

const git = require('../../git-static');

const { pathAsJSON } = require('../../utils');
const { mkdirSafe, checkFileExists } = require('../../utils/fs');

module.exports = {
    async generate(o) {
        const debug = o.debug.extend('git-static');
        debug('start');

        const gitStaticPath = `${o.argv.home}/git-static`;
        const configPath = `${gitStaticPath}/git-static.json`;
        const repositoriesPath = `${gitStaticPath}/repositories`;
        const outputGitStatic = `${o.config._outputPath}/git-static`;
        const stateFile = `${gitStaticPath}/state.json`;
        const myZone = o.config.parser.server.location.source.zone ?? '';

        await Promise.all([
            mkdirSafe(gitStaticPath),
            mkdirSafe(repositoriesPath),
            mkdirSafe(outputGitStatic),
        ]);

        const gitStaticConfig = {
            servers: Object.keys(o.config.parser.routers.map),
            repositories: {},
        };

        const state = await pathAsJSON(stateFile, {});

        const repositories = o.config?.services?.git?.repositories ?? {};
        for (const [key, original] of Object.entries(repositories)) {
            const value = {...original};

            if (value.master) {
                const serverZone = (o.config.parser.servers.map[value.master].location.source.zone ?? '');
                if (serverZone !== myZone) {
                    continue;
                }
                value.isMaster = value.master === o.config._hostname;
            }

            gitStaticConfig.repositories[key] = value;


            const repoExists = await checkFileExists(`${repositoriesPath}/${key}`);
            try {
                const updates = await git.pullCloneCommand(repositoriesPath, key, value.repository);
                state[key] = new Date();
                debug(`${key}: ${updates === true ? 'updated' : 'no updates'}`);
            } catch (e) {
                if (!repoExists) {
                    throw e;
                }
                debug(`${key}: error: ${e.message}`);
            }
        }

        await Promise.all([
            fs.writeFile(stateFile, JSON.stringify(state, null, 4)),
            fs.writeFile(configPath, JSON.stringify(gitStaticConfig, null, 4)),
        ]);

        await fs.copyFile(configPath, `${outputGitStatic}/git-static.json`);

        debug('done');
    },
};
