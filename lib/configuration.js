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
            debugConfig(`working on static config: ${staticConfig.name}`);
            mergeObject(JSON.parse(staticConfig.content), layer);
        }
        mergeObject(data, layer);
        return layer;
    } else {
        return data;
    }
};

function processConfigPart(x) {
    const parts = x.split(' ');
    const result = {};
    for (const part of parts) {
        const [partName, ...partOptions] = part.split(':');
        result[partName] = [partOptions].flat() || [];
    }
    return result;
}
config.configPart = processConfigPart(argv.configPart);
config.configPartPath = path.resolve(argv.configPartPath || `${argv.home}/part.d`);
config.applyPartLayers = async function (data) {
    debugConfig(`part config directory: ${config.configPartPath}`);
    const layer = {};
    const configPartPromises = Object.entries(config.configPart)
        .filter((x) => !x[1].includes('no-store'))
        .map(async (x) => {
            try {
                const content = await fs.promises.readFile(path.join(config.configPartPath, `${x[0]}.json`), 'utf8');
                return {
                    ready: true,
                    name: x[0],
                    content,
                };
            } catch {
                return {
                    name: x[0],
                    content: '{}',
                };
            }
        });
    const configParts = await Promise.all(configPartPromises);
    data.names = [];
    for (const configPart of configParts) {
        if (configPart.ready === true) {
            data.names.push(configPart.name);
            debugConfig(`working on part config: ${configPart.name}`);
            mergeObject(JSON.parse(configPart.content), layer);
        }
    }
    mergeObject(data, layer);
    return layer;
};

config.set = async function (data) {
    await Promise.all([
        mkdirSafe(argv.home),
        mkdirSafe(config.configPartPath),
    ]);

    const configName = argv.configName || data.name || 'default';
    const configCurrentPart = config.configPart[configName];
    if (!configCurrentPart) {
        throw new Error(`ERROR: no "${configName}" in configPart!`);
    }
    if (!configCurrentPart.includes('no-store')) {
        const parserPre = yaumnrc.parse({ ...data });
        await fs.promises.writeFile(path.join(config.configPartPath, `${configName}.json`), parserPre.toSourceNonSecure());
    }

    data = await config.applyStaticLayers(data);
    data = await config.applyPartLayers(data);

    data.names.push(configName);
    const ready = Object.entries(config.configPart)
        .filter((x) => !x[1].includes('no-store'))
        .map((x) => x[0])
        .every((x) => data.names.includes(x));
    if (!ready) {
        throw new Error('not ready');
    }

    if (configCurrentPart.includes('no-apply')) {
        throw new Error('no-apply');
    }

    debugConfig('trying to set new config');
    const parser = yaumnrc.parse({ ...data });
    debugConfig('yaumnrced');
    config.parser = parser;
    for (const key of keys) {
        config[key] = data[key];
    }
    await config.parse();
    debugConfig('parsed');
    config.printInfo();
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
