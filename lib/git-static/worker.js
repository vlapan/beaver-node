const fs = require('fs');
const debug = require('debug')('beaver:daemons:git-static:worker');

const git = require('./index');

function shutdown() {
    process.exit();
}
process.on('disconnect', shutdown);

function parseJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch (err) {
        return {};
    }
}

async function parse(config) {
    if (typeof config !== 'object') {
        process.send({
            error: 'no config',
        }, shutdown);
        return;
    }


    const gitStaticPath = config.path;
    if (!fs.existsSync(gitStaticPath)) {
        fs.mkdirSync(gitStaticPath);
    }

    const repositoriesPath = `${gitStaticPath}/repositories`;
    if (!fs.existsSync(repositoriesPath)) {
        fs.mkdirSync(repositoriesPath);
    }

    const state = parseJSON(config.stateFile);

    const date = new Date();

    const pushEventRepositories = [];
    for (const [key, value] of Object.entries(config.repositories)) {
        if (value.isMaster === false) {
            debug(`${key}: passive mode`);
            continue;
        }
        if (state[key]) {
            const lastPull = new Date(state[key]);
            const pullInterval = ((value.pullInterval | 0) || 5 * 60) * 1000;
            if (lastPull && (date - lastPull) < pullInterval) {
                debug(`${key}: not yet`);
                continue;
            }
        }

        debug(`${key}: updating...`);

        const updates = await git.pullCloneCommand(repositoriesPath, key, value.repository);
        if (updates === true && value.isMaster) {
            pushEventRepositories.push(key);
        }

        state[key] = new Date();

        debug(`${key}: ${updates === true ? 'updated' : 'no updates'}`);
    }

    fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 4));

    process.send({
        result: true,
        pushEventRepositories,
    }, shutdown);
}

process.on('message', parse);
