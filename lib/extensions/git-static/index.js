const fs = require('fs');
const async = require('async');

const argv = require('../../argv');
const config = require('../../configuration');
const logger = require('../../logger');

const git = require('../../git-static');

function parseJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch (err) {
        return {};
    }
}

module.exports = {
    generate(callback) {
        logger.banner('GitStatic configuration generation');

        const gitStaticPath = `${argv.home}/git-static`;
        if (!fs.existsSync(gitStaticPath)) {
            fs.mkdirSync(gitStaticPath);
        }

        const configPath = `${gitStaticPath}/git-static.json`;

        const repositoriesPath = `${gitStaticPath}/repositories`;
        if (!fs.existsSync(repositoriesPath)) {
            fs.mkdirSync(repositoriesPath);
        }

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

            git.pullCloneCommand(repositoriesPath, key, value.repository);

            state[key] = new Date();

            logger.log('info', `git-static: ${key}: updated`);
        }

        async.parallel({
            writeState: (cb) => {
                fs.writeFile(stateFile, JSON.stringify(state, null, 4), cb);
            },
            writeConfig: (cb) => {
                fs.writeFile(configPath, JSON.stringify(gitStaticConfig, null, 4), cb);
            }
        }, (err) => {
            if (callback) {
                callback(err, true);
            }
        });
    }
};
