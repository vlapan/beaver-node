const fs = require('fs');
const path = require('path');

const util = require('util');
const exec = util.promisify(require('child_process').exec);

const gitTemplate = fs.readFileSync(path.resolve(__dirname, 'git.sh'), 'utf-8');

function parseJSON(file) {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch (err) {
        return {};
    }
}

const m = {
    pullCloneCommand: async (resource, name, url) => {
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

        const { stdout } = await exec(gitCommand);
        const updates = stdout !== 'Already up to date.\n';
        if (stdout && updates) {
            console.log(stdout);
        }
        return updates;
    },
    async pullClone(repository, gitStaticPath) {
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

        if (!config.repositories || !config.repositories[repository]) {
            this.log(`${repository}: not found!`);
            return false;
        }

        this.log(`${repository}: updating...`);
        const updates = await m.pullCloneCommand(repositoriesPath, repository, config.repositories[repository].repository);
        state[repository] = new Date();
        this.log(`${repository}: ${updates === true ? 'updated' : 'no updates'}`);

        fs.writeFileSync(stateFile, JSON.stringify(state, null, 4));

        return updates;
    },
};

module.exports = m;
