const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const gitTemplate = fs.readFileSync(path.resolve(__dirname, 'git.sh'), 'utf-8');

function parseJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch (err) {
        return {};
    }
}

const m = {
    pullCloneCommand: (resource, name, url) => {
        const gitCommand = gitTemplate.replace(/%\{([a-z0-9]+)\}/gi, (match, p1) => {
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

        execSync(gitCommand, {
            shell: 'bash',
        });
    },
    pullClone(repository) {
        const argv = require('../argv');

        const gitStaticPath = `${argv.home}/git-static`;
        if (!fs.existsSync(gitStaticPath)) {
            fs.mkdirSync(gitStaticPath);
        }

        const repositoriesPath = `${gitStaticPath}/repositories`;
        if (!fs.existsSync(repositoriesPath)) {
            fs.mkdirSync(repositoriesPath);
        }

        const stateFile = `${gitStaticPath}/state.json`;
        const state = parseJSON(stateFile);

        const configFile = `${gitStaticPath}/git-static.json`;
        const config = parseJSON(configFile);

        this.log(`${repository}: updating...`);
        m.pullCloneCommand(repositoriesPath, repository, config.repositories[repository].repository);
        state[repository] = new Date();
        this.log(`${repository}: updated`);

        fs.writeFileSync(stateFile, JSON.stringify(state, null, 4));
    },
};

module.exports = m;
