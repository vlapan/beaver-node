const fs = require('fs');
const {execSync} = require('child_process');

const gitTemplate = fs.readFileSync(`${__dirname}/../extensions/git-static/git.sh`, 'UTF-8');

function shutdown() {
    process.exit();
}
process.on('disconnect', shutdown);

function log(m) {
    process.stdout.write(`${m}\n`);
}

function parseJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch (err) {
        return {};
    }
}

function parse(config) {
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

    for (const [key, value] of Object.entries(config.repositories)) {
        const lastPull = new Date(state[key]);
        const pullInterval = ((value.pullInterval | 0) || 5 * 60) * 1000;
        if (lastPull && (date - lastPull) < pullInterval) {
            log(`git-static: ${key}: not yet`);
            continue;
        }

        log(`git-static: ${key}: updating...`);

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

        log(`git-static: ${key}: updated`);
    }

    fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 4));

    process.send({
        result: true
    }, shutdown);
}

process.on('message', parse);
