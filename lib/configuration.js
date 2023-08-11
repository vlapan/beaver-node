const fs = require('fs');
const os = require('os');
const path = require('path');

const debug = require('debug');
const yaumnrc = require('clean-yaumnrc');

const argv = require('./argv');
const { pathAsJSON } = require('./utils');
const { mkdirSafe } = require('./utils/fs');

const debugConfig = debug('beaver:config');

// ----------------------------

const config = {
    version: 0,
};

const { hostname, platform } = argv;

config._hostname = hostname;

config.parse = async function () {
    config.parser = config.parser.makeView(hostname);
    if (!config.parser) {
        throw new Error(`Unable to find "${hostname}" in config.servers`);
    }

    const hostConfig = config.parser.server.source;
    if (!hostConfig.location || !config.parser.location) {
        throw new Error(`Unable to find host's location "${hostname}" in config.servers`);
    }
    config._hostConfig = hostConfig;

    const sslUse = {};
    for (const [routeKey, route] of Object.entries(config.parser.targets.source)) {
        if (typeof route.ssl === 'string' && route.ssl.match(/^use:.*/)) {
            const sslUseKey = route.ssl.split(':')[1];
            if (!sslUse[sslUseKey]) {
                sslUse[sslUseKey] = [];
            }
            sslUse[sslUseKey].push(routeKey);
        }
    }
    config._sslUse = sslUse;

    if (argv.o) {
        const outputPath = path.normalize(argv.o);
        await mkdirSafe(outputPath);
        config._outputPath = outputPath;
    } else {
        config._outputPath = await fs.promises.mkdtemp(path.resolve(os.tmpdir(), 'beaver-output-'));
    }
};

config.printInfo = function () {
    const debugInfo = debugConfig.extend('info');
    debugInfo(`now: ${(new Date().toISOString())}`);
    debugInfo(`hostname: ${hostname}`);
    debugInfo(`platform: ${platform}`);
    debugInfo(`location: ${config.parser.location.key} - ${config.parser.location.title}`);
    if (config._hostConfig.lan) {
        debugInfo(`lan.mac: ${config._hostConfig.lan.mac}`);
        debugInfo(`lan.ip: ${config._hostConfig.lan.ip}`);
    }
    if (config._hostConfig.wan) {
        debugInfo(`wan.mac: ${config._hostConfig.wan.mac}`);
        debugInfo(`wan.ip: ${config._hostConfig.wan.ip}`);
    }
};

const keys = ['locations', 'servers', 'test', 'vms', 'kvm', 'monitoring', 'routing', 'services'];

config.set = async function (data) {
    debugConfig('trying to set new config');
    const parser = yaumnrc.parse({ ...data });
    debugConfig('yaumnrced');
    config.parser = parser;
    keys.forEach((key) => {
        config[key] = data[key];
    });
    await config.parse();
    debugConfig('parsed');
    config.printInfo();

    // TODO: move to extentions
    await mkdirSafe(argv.home);
};

config.cleanPath = `${argv.home}/config-clean.json`;
config.loadClean = async function () {
    return pathAsJSON(config.cleanPath, false);
};

config.readFile = async function () {
    const configPath = path.resolve(argv.input);
    try {
        debugConfig('read file');
        const json = await fs.promises.readFile(configPath);
        debugConfig('json parse');
        const data = JSON.parse(json);
        await config.set(data);
        config.failed = false;
    } catch (e) {
        config.failed = true;
        console.error(e);
        process.exitCode = 1;
        debugConfig('failed');
        throw e;
    }
};

config.watch = function (callback) {
    const debugDaemon = debug('beaver:daemons:config-watcher');
    const input = path.resolve(argv.input);
    debugDaemon(`${input}: watching for modifications`);
    fs.watchFile(input, async (curr, prev) => {
        if (curr.mtime > prev.mtime) {
            debugDaemon(`${input}: modification detected`);
            try {
                await config.readFile();
                if (typeof callback === 'function') {
                    await callback();
                }
                debugDaemon(`${input}: done`);
            } catch (e) {
                debugDaemon(`${input}: failed`);
            }
        }
    });
};

module.exports = config;
