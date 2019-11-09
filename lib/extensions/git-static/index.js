const fs = require('fs');
const {execSync} = require('child_process');
const async = require('async');

const argv = require(`../../argv`);
const config = require(`../../configuration`);
const logger = require(`../../logger`);

const gitTemplate = fs.readFileSync(`${__dirname}/git.sh`, 'UTF-8');

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
            repositories: {},
        };


        const state = parseJSON(stateFile);

        const {repositories} = config.services && config.services.git || {};
        for (const [key, value] of Object.entries(repositories)) {
            gitStaticConfig.repositories[key] = value;
            const gitCommand = gitTemplate.replace(/%\{([a-z0-9]+)\}/gi, (match, p1) => {
                switch (p1) {
                case 'path':
                    return repositoriesPath;
                case 'name':
                    return key;
                case 'url':
                    return value.repository;
                default:
                    break;
                }
                return false;
            });

            execSync(gitCommand, {
                shell: 'bash',
            });

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
