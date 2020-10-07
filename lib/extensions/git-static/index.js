const fs = require('fs/promises');
const async = require('async');

const argv = require('../../argv');
const config = require('../../configuration');
const git = require('../../git-static');

const { mkdirSafe } = require('../../utils/fs');

function parseJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch (err) {
        return {};
    }
}

module.exports = {
    async generate(o) {
        const debug = o.debug.extend('git-static');
        debug('start');

        const gitStaticPath = `${argv.home}/git-static`;
        await mkdirSafe(gitStaticPath);

        const configPath = `${gitStaticPath}/git-static.json`;

        const repositoriesPath = `${gitStaticPath}/repositories`;
        await mkdirSafe(repositoriesPath);

        const stateFile = `${gitStaticPath}/state.json`;

        const gitStaticConfig = {
            path: gitStaticPath,
            stateFile,
            servers: [],
            repositories: {},
        };

        for (const router of config.parser.routers.list) {
            gitStaticConfig.servers.push(router.source.key);
        }

        const state = parseJSON(stateFile);

        const repositories = config.services && config.services.git && config.services.git.repositories || {};
        for (const [key, value] of Object.entries(repositories)) {
            gitStaticConfig.repositories[key] = value;

            if (value.master) {
                value.isMaster = value.master === config._hostname;
            }
            const updates = await git.pullCloneCommand(repositoriesPath, key, value.repository);

            state[key] = new Date();

            debug(`${key}: ${updates === true ? 'updated' : 'no updates'}`);
        }

        await Promise.all([
            fs.writeFile(stateFile, JSON.stringify(state, null, 4)),
            fs.writeFile(configPath, JSON.stringify(gitStaticConfig, null, 4)),
        ]);

        debug('done');
    }
};
