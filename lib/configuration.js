const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const debug = require('debug');
const yaumnrc = require('clean-yaumnrc');

const argv = require('./argv');
const { pathAsJSON, mergeObject } = require('./utils');
const { mkdirSafe, checkDirectoryExists, findFile } = require('./utils/fs');

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

const keys = ['locations', 'servers', 'test', 'vms', 'kvm', 'monitoring', 'routing', 'services', 'name'];

config.staticConfigsPath = path.resolve(argv.staticConfigsPath || `${argv.home}/conf.d`);
config.applyStaticLayers = async function (data) {
    debugConfig(`static configs directory: ${config.staticConfigsPath}`);
    if (await checkDirectoryExists(config.staticConfigsPath)) {
        const layer = {};
        const staticConfigsPaths = await findFile(config.staticConfigsPath, /.*\.json/, false);
        const staticConfigsPromises = staticConfigsPaths.sort().map(async (name) => {
            const content = await fs.promises.readFile(name, 'utf8');
            return {
                name,
                content,
            };
        });
        const staticConfigs = await Promise.all(staticConfigsPromises);
        for (const staticConfig of staticConfigs) {
            debugConfig(`working on static config: ${staticConfig.name}`)
            mergeObject(JSON.parse(staticConfig.content), layer);
        }
        mergeObject(data, layer);
        return layer;
    } else {
        return data;
    }
};

config.set = async function (data) {
    data = await config.applyStaticLayers(data);
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
        const json = await fs.promises.readFile(configPath, 'utf8');
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
            } catch {
                debugDaemon(`${input}: failed`);
            }
        }
    });
};

module.exports = config;
