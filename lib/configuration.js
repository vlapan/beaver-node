const fs = require('fs');
const os = require('os');
const path = require('path');

const argv = require(`${__dirname}/argv`);
const logger = require(`${__dirname}/logger`);

//----------------------------

const config = {
    version: 0,
};

const hostname = argv.hostname;
config._hostname = hostname;

const platform = argv.platform;

// var yaml = require('js-yaml');
config.parse = function () {
    // console.log(yaml.dump(config, {
    // 	indent: 4
    // }));
    // process.exit();

    if (config.test) {
        Object.keys(config.test).forEach((key) => {
            config.servers[key] = config.test[key];
        });
    }

    logger.log('info', '======================================================================');
    logger.log('info', 'General information');
    logger.log('info', '----------------------------------------------------------------------');

    logger.log('info', 'hostname:', hostname);
    logger.log('info', 'platform:', platform);

    config.parser = config.parser.makeView(hostname);
    if (!config.parser) {
        logger.error(`Unable to find "${hostname}" in config.servers`);
        process.exit();
    }

    const hostConfig = config._hostConfig = config.parser.server.source;

    if (!hostConfig.location) {
        logger.error(`Unable to find host's location "${hostname}" in config.servers`);
        process.exit();
    }

    logger.log('info', 'location:', config.parser.location.key, '-', config.parser.location.title);

    if (hostConfig.lan) {
        logger.log('info', 'lan.mac:', hostConfig.lan.mac);
        logger.log('info', 'lan.ip:', hostConfig.lan.ip);
    }
    if (hostConfig.wan) {
        logger.log('info', 'wan.mac:', hostConfig.wan.mac);
        logger.log('info', 'wan.ip:', hostConfig.wan.ip);
    }


    config._hosts = {};
    for (var key of Object.keys(config.servers)) {
        if (config._hosts[key]) {
            return;
        }
        var item = config.servers[key];
        item.key = key;
        config._hosts[key] = item;
    }
    logger.log('info', 'total hosts:', Object.keys(config._hosts).length);

    config._routers = [];
    const keys = Object.keys(config.servers);
    for (let i = 0, till = keys.length; i < till; i++) {
        var key = keys[i];
        var item = config.servers[key];
        if (item.router) {
            config._routers.push(item);
        }
    }
    logger.log('info', 'total routers:', Object.keys(config._routers).length);


    const targets = config._targets = {};
    logger.log('debug', '======================================================================');
    logger.log('debug', 'Processing targets...');
    logger.log('debug', '----------------------------------------------------------------------');
    config.routing.routes && Object.keys(config.routing.routes).map(routeKey => config.routing.routes[routeKey].target).reduce((a, b) => {
        return !b ? a : a ? [].concat(a).concat(b) : [].concat(b);
    }).filter((serverKey) => {
        if (serverKey.match(/^https?:\/\//gi)) {
            logger.log('debug', `"${serverKey}" target accepted, static route`);
            return true;
        }

        const server = config.servers[serverKey];
        if (server) {
            if (serverKey === hostname) {
                server.self = true;
            }
            if (server.location !== hostConfig.location) {
                logger.log('debug', `"${serverKey}" target accepted (servers), external location - ${server.location}`);
                return true;
            }
            logger.log('debug', `"${serverKey}" target accepted (servers)`);
            return true;
        }

        logger.log('debug', `"${serverKey}" target is not in the list(servers+vms)`);
        return false;
    }).forEach((serverKey) => {
        if (targets[serverKey]) {
            return;
        }

        if (serverKey.match(/^https?:\/\//gi)) {
            targets[serverKey] = serverKey;
        }

        const server = config.servers[serverKey];
        if (server) {
            targets[serverKey] = server;
        }
    });
    logger.log('info', 'Accepted targets:', Object.keys(targets).join(', '));

    const targetsVirtual = config._targetsVirtual = {};
    logger.log('debug', '======================================================================');
    logger.log('debug', 'Processing virtual targets...');
    logger.log('debug', '----------------------------------------------------------------------');
    Object.keys(config.routing.routes).forEach((routeKey) => {
        if (targets[routeKey]) {
            return;
        }
        const route = config.routing.routes[routeKey];
        [].concat(route.target).forEach((targetKey) => {
            if (targets[targetKey]) {
                logger.log('debug', `"${routeKey}" route has a target ${targetKey}`);
                const target = targets[targetKey];
                if (typeof targets[targetKey] === 'object') {
                    target.key = targetKey;
                }
                if (!targetsVirtual[routeKey]) {
                    targetsVirtual[routeKey] = [target];
                } else {
                    targetsVirtual[routeKey].push(target);
                }
            } else {
                logger.log('debug', `"${routeKey}" route, target "${targetKey}" not found, skipped`);
            }
        });
    });
    logger.log('info', 'Accepted virtual targets:', Object.keys(targetsVirtual).join(', '));


    logger.log('debug', '======================================================================');
    logger.log('debug', 'Processing routes...');
    logger.log('debug', '----------------------------------------------------------------------');
    const sslUse = config._sslUse = {};
    const routes = config._routes = {};
    Object.keys(config.routing.routes).forEach((routeKey) => {
        const route = config.routing.routes[routeKey];
        if (typeof route.ssl === 'string' && route.ssl.match(/^use:.*/)) {
            const sslUseKey = route.ssl.split(':')[1];
            if (!sslUse[sslUseKey]) {
                sslUse[sslUseKey] = [];
            }
            sslUse[sslUseKey].push(routeKey);
        }
        if (!route.target) {
            logger.log('debug', `"${routeKey}" route has no target, skipped`);
            return;
        }
        if (typeof route.target === 'string') {
            if (targets[route.target]) {
                logger.log('debug', `"${routeKey}" route has a target ${route.target}`);
                routes[routeKey] = [targets[route.target]];
                if (config._hostConfig.location === targets[route.target].location) {
                    route.localLocation = true;
                }
            } else if (targetsVirtual[route.target]) {
                logger.log('debug', `"${routeKey}" route has a linked target ${route.target}`);
                if (!route.ssl && config.routing.routes[route.target].ssl) {
                    logger.log('debug', `"${routeKey}" found ssl in ${route.target}`);
                    route.ssl = config.routing.routes[route.target].ssl;
                }
                routes[routeKey] = targetsVirtual[route.target];
                const locations = targetsVirtual[route.target].map(item => item.location);
                if (~locations.indexOf(config._hostConfig.location)) {
                    route.localLocation = true;
                }
            } else {
                logger.log('debug', `"${routeKey}" route, target "${route.target}" not found, skipped`);
            }
        } else if (typeof route.target === 'object') {
            route.target.forEach((targetKey) => {
                if (targets[targetKey]) {
                    logger.log('debug', `"${routeKey}" route has a target ${targetKey}`);
                    var target = targets[targetKey];
                    if (typeof target === 'object') {
                        target.key = targetKey;
                    }
                    if (!routes[routeKey]) {
                        routes[routeKey] = [target];
                    } else {
                        routes[routeKey].push(target);
                    }
                    if (config._hostConfig.location === target.location) {
                        route.localLocation = true;
                    }
                } else if (targetsVirtual[route.target]) {
                    logger.log('debug', `"${routeKey}" route has a linked target ${route.target}`);
                    if (!route.ssl && config.routing.routes[route.target].ssl) {
                        logger.log('debug', `"${routeKey}" found ssl in ${route.target}`);
                        route.ssl = config.routing.routes[route.target].ssl;
                    }
                    var target = targetsVirtual[targetKey];
                    if (typeof target === 'object') {
                        target.key = targetKey;
                    }
                    if (!routes[routeKey]) {
                        routes[routeKey] = [target];
                    } else {
                        routes[routeKey].push(target);
                    }
                    const locations = target.map(item => item.location);
                    if (~locations.indexOf(config._hostConfig.location)) {
                        route.localLocation = true;
                    }
                } else {
                    logger.log('debug', `"${routeKey}" route, target "${targetKey}" not found, skipped`);
                }
            });
        }
    });
    logger.log('info', 'Accepted routes:', Object.keys(routes).join(', '));

    if (!Object.keys(routes).length) {
        logger.error('routes length is zero');
        process.exit();
    }

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

const keys = ['locations', 'servers', 'test', 'vms', 'kvm', 'monitoring', 'routing'];

const yaumnrc = require('clean-yaumnrc');

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
