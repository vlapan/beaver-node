const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

const debug = require('debug')('beaver:daemons:git-static');

const argv = require('../argv');
const server = require('./server');
const events = require('./events');

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
        getConfig: () => this.config,
    });
}

GitStatic.prototype.log = function (level, message) {
    debug(message);
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
    } catch {
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
        // this.log('verbose', `interval not found, using default interval ${this.options.interval}`);
        this.config.interval = this.options.interval | 0;
    }

    if (!this.config.stateFile) {
        this.config.stateFile = `${this.config.path}/state.json`;
    }

    this.config.hostname = argv.hostname;
    this.config.firstRun = true;

    this.log('info', `config loaded, ${this.getSettingsString()}`);
};

GitStatic.prototype.processResults = function (data) {
    if (data.error) {
        this.log('warn', data.error);
        return;
    }

    this.config.firstRun = false;

    if (data.pushEventRepositories && data.pushEventRepositories.length > 0) {
        events.pushEvent(this.config, data.pushEventRepositories, true);
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

    const workerFile = path.resolve(__dirname, 'worker.js');
    if (!fs.existsSync(workerFile)) {
        this.log('debug', `module file not found '${workerFile}'`);
        this.watch();
        return;
    }

    this.active = true;

    this.log('debug', `forking worker.js process, ${this.getSettingsString()}`);

    const child = childProcess.fork(workerFile);
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
