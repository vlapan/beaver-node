import git from './index.js';
import fs from 'node:fs';

import createDebug from 'debug';
const debug = createDebug('beaver:daemons:git-static:worker');
import { pathAsJSON } from '../utils/index.js';
import { mkdirSafe } from '../utils/fs.js';

function shutdown() {
    process.exit();
}
process.on('disconnect', shutdown);

async function parse(config) {
    if (typeof config !== 'object') {
        process.send({
            error: 'no config',
        }, shutdown);
        return;
    }

    const gitStaticPath = `${process.env.BEAVER_HOME}/git-static`;
    const stateFile = `${gitStaticPath}/state.json`;
    const [repositoriesPath, state] = await Promise.all([
        mkdirSafe(`${gitStaticPath}/repositories`),
        pathAsJSON(stateFile, {}),
    ]);

    const date = new Date();

    const pushEventRepositories = [];
    for (const [key, value] of Object.entries(config.repositories)) {
        if (config.firstRun === false && value.isMaster === false) {
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

        try {
            const updates = await git.pullCloneCommand(repositoriesPath, key, value.repository);
            if (updates === true && value.isMaster) {
                pushEventRepositories.push(key);
            }
            state[key] = new Date();
            debug(`${key}: ${updates === true ? 'updated' : 'no updates'}`);
        } catch (e) {
            debug(`${key}: ERROR: ${e}`);
        }
    }

    await fs.promises.writeFile(stateFile, JSON.stringify(state, null, 4));

    process.send({
        result: true,
        pushEventRepositories,
    }, shutdown);
}

process.on('message', parse);
