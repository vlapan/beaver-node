const fs = require('node:fs/promises');

const git = require('../../git-static');

const { pathAsJSON, intersects } = require('../../utils');
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
        const myZone = [o.config.parser.server.zone ?? ''].flat();

        await Promise.all([
            mkdirSafe(gitStaticPath),
            mkdirSafe(repositoriesPath),
            mkdirSafe(outputGitStatic),
        ]);

        const gitStaticConfig = {
            servers: Object.entries(o.config.parser.routers.map)
                .filter((x) => intersects(myZone, [x[1].zone ?? ''].flat()))
                .map((x) => x[0]),
            repositories: {},
        };

        const state = await pathAsJSON(stateFile, {});

        const repositories = o.config?.services?.git?.repositories ?? {};
        for (const [key, original] of Object.entries(repositories)) {
            const value = {
                ...original,
            };

            const repositoryZone = [value.zone ?? ''].flat();
            if (!intersects(myZone, repositoryZone)) {
                continue;
            }

            if (value.master) {
                value.isMaster = value.master === o.config._hostname;
            }

            gitStaticConfig.repositories[key] = value;

            if (!o.argv.disableGitStaticPull) {
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
        }

        await Promise.all([
            fs.writeFile(stateFile, JSON.stringify(state, null, 4)),
            fs.writeFile(configPath, JSON.stringify(gitStaticConfig, null, 4)),
        ]);

        await fs.copyFile(configPath, `${outputGitStatic}/git-static.json`);

        debug('done');
    },
};
