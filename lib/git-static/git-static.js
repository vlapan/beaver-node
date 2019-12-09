const fs = require('fs');
const childProcess = require('child_process');

const argv = require('../argv');
const logger = require('../logger');

const server = require('./server');

function GitStatic(options) {
    this.moduleName = 'git-static';
    this.options = options;
    this.active = false;
    this.config = false;
    this.configChanged = false;
    this.readConfig();
    fs.watchFile(this.options.data, this.setConfigChanged.bind(this));

    const gitStaticPath = `${argv.home}/git-static`;
    if (!fs.existsSync(gitStaticPath)) {
        fs.mkdirSync(gitStaticPath);
    }
    this.gitStaticPath = gitStaticPath;

    const repositoriesPath = `${gitStaticPath}/repositories`;
    if (!fs.existsSync(repositoriesPath)) {
        fs.mkdirSync(repositoriesPath);
    }

    server({
        port: argv.httpGitStaticPort,
    });
}

GitStatic.prototype.log = function (level, message) {
    logger.log(level, `${this.moduleName}: ${message}`);
};

GitStatic.prototype.setConfigChanged = function () {
    this.log('debug', `config change detected "${this.options.data}"`);
    this.configChanged = true;
    this.watch(1);
};

GitStatic.prototype.getSettingsString = function () {
    const modeName = this.config.testing ? 'testing' : 'production';
    return `${modeName} mode, interval: ${this.config.interval} ms`;
};

GitStatic.prototype.parseJSON = function () {
    try {
        this.config = JSON.parse(fs.readFileSync(this.options.data));
        return true;
    } catch (e) {
        return false;
    }
};

GitStatic.prototype.readConfig = function () {
    this.configChanged = false;

    if (!fs.existsSync(this.options.data)) {
        this.log('debug', 'input file is not found, empty loop mode');
        this.config = false;
        return;
    }

    if (!this.parseJSON()) {
        this.log('info', 'config json parse failed, acme disabled, empty loop mode');
        this.config = false;
        return;
    }

    if (this.config.disabled) {
        this.log('info', 'config loaded, acme disabled, empty loop mode');
        this.config = false;
        return;
    }

    if (!this.config.repositories) {
        this.config.repositories = {};
    }

    if (!this.config.interval) {
        this.log('verbose', `interval not found, using default interval ${this.options.interval}`);
        this.config.interval = this.options.interval | 0;
    }

    if (!this.config.stateFile) {
        this.config.stateFile = `${this.config.path}/state.json`;
    }

    this.config.hostname = argv.hostname;

    this.log('info', `config loaded, ${this.getSettingsString()}`);
};

GitStatic.prototype.processResults = function (data) {
    if (data.error) {
        this.log('warn', data.error);
        return;
    }
    this.log('debug', 'received successful result from worker.js process');
};

GitStatic.prototype.workerExitHandler = function (code, signal) {
    this.log('debug', `worker.js exit event ${code} ${signal}`);
    this.active = false;
    this.watch();
};

GitStatic.prototype.start = function () {
    if (this.active) {
        return;
    }
    if (this.configChanged || !this.config || this.config.disabled) {
        this.watch();
        return;
    }
    if (!fs.existsSync(`${__dirname}/worker.js`)) {
        this.log('debug', 'module file not found worker.js');
        this.watch();
        return;
    }

    this.active = true;

    this.log('debug', `forking worker.js process, ${this.getSettingsString()}`);

    const child = childProcess.fork(`${__dirname}/worker.js`);
    child.on('message', this.processResults.bind(this));
    child.on('error', this.workerExitHandler.bind(this));
    child.on('exit', this.workerExitHandler.bind(this));
    child.send(this.config);
};

GitStatic.prototype.watch = function (interval) {
    if (this.configChanged) {
        this.readConfig();
    }

    clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(this.start.bind(this), interval || this.config.interval || this.options.interval);
    if (global.gc) {
        global.gc();
    }
};

module.exports = GitStatic;
