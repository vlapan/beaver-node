const fs = require('fs');
const os = require('os');
const path = require('path');

const yaumnrc = require('clean-yaumnrc');

const argv = require('./argv');
const logger = require('./logger');

//----------------------------

const config = {
    version: 0,
};

const {hostname, platform} = argv;

config._hostname = hostname;

config.parse = function () {
    logger.banner('General information');
    logger.log('info', `hostname: ${hostname}`);
    logger.log('info', `platform: ${platform}`);

    config.parser = config.parser.makeView(hostname);
    if (!config.parser) {
        logger.error(`Unable to find "${hostname}" in config.servers`);
        process.exit();
    }

    const hostConfig = config.parser.server.source;
    if (!hostConfig.location) {
        logger.error(`Unable to find host's location "${hostname}" in config.servers`);
        process.exit();
    }
    config._hostConfig = hostConfig;

    logger.log('info', `location: ${config.parser.location.key} - ${config.parser.location.title}`);

    if (hostConfig.lan) {
        logger.log('info', `lan.mac: ${hostConfig.lan.mac}`);
        logger.log('info', `lan.ip: ${hostConfig.lan.ip}`);
    }
    if (hostConfig.wan) {
        logger.log('info', `wan.mac: ${hostConfig.wan.mac}`);
        logger.log('info', `wan.ip: ${hostConfig.wan.ip}`);
    }

    const sslUse = {};
    Object.keys(config.parser.targets.source).forEach((routeKey) => {
        const route = config.parser.targets.source[routeKey];
        if (typeof route.ssl === 'string' && route.ssl.match(/^use:.*/)) {
            const sslUseKey = route.ssl.split(':')[1];
            if (!sslUse[sslUseKey]) {
                sslUse[sslUseKey] = [];
            }
            sslUse[sslUseKey].push(routeKey);
        }
    });
    config._sslUse = sslUse;

    if (argv.o) {
        const outputPath = path.normalize(argv.o);
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath);
        }
        config._outputPath = outputPath;
    } else {
        config._outputPath = fs.mkdtempSync(path.resolve(os.tmpdir(), 'beaver-output-'));
    }
};

const keys = ['locations', 'servers', 'test', 'vms', 'kvm', 'monitoring', 'routing', 'services'];

config.set = function (data) {
    const parser = yaumnrc.parse(Object.assign({}, data));
    fs.writeFile(`${argv.home}/config-clean.json`, parser.toSourceNonSecure(), (err) => {
        if (err) {
            throw err;
        }
    });
    config.parser = parser;
    keys.forEach((key) => {
        config[key] = data[key];
    });
    config.parse();
};

if (argv.input) {
    const configPath = path.resolve(argv.input);

    config.readFile = function () {
        config.set(JSON.parse(fs.readFileSync(configPath, 'UTF-8')));
    };
    config.readFile();

    config.watch = function (callback) {
        fs.watchFile(path.resolve(argv.input), (curr, prev) => {
            logger.log('info', `config file, modification detected "${argv.input}"!`);
            config.readFile();
            callback && callback();
        });
    };
}

module.exports = config;
