var fs = require('fs');
var os = require('os');
var path = require('path');

var temp = require('temp');

var argv = require(__dirname + '/argv');
var logger = require(__dirname + '/logger');

var config = {};

var hostname = os.hostname();
if (argv.h) {
	hostname = argv.h;
}
config._hostname = hostname;

var platform = os.platform();
if (argv.p) {
	platform = argv.p;
}

//----------------------------

config.parse = function () {
	Object.keys(config.test).forEach(function (key) {
		config.vms[key] = config.test[key];
	});

	logger.log('info', '======================================================================');
	logger.log('info', 'General information');
	logger.log('info', '----------------------------------------------------------------------');

	logger.log('info', 'hostname:', hostname);
	logger.log('info', 'platform:', platform);

	var hostConfig = config._hostConfig = config.vms[hostname];
	if (!hostConfig) {
		logger.error('Unable to find "' + hostname + '" in config.vms');
		process.exit();
	}

	logger.log('info', 'location:', hostConfig.location, '-', config.locations[hostConfig.location].title);
	if (hostConfig.lan) {
		logger.log('info', 'lan.mac:', hostConfig.lan.mac);
		logger.log('info', 'lan.ip:', hostConfig.lan.ip);
	}
	if (hostConfig.wan) {
		logger.log('info', 'wan.mac:', hostConfig.wan.mac);
		logger.log('info', 'wan.ip:', hostConfig.wan.ip);
	}


	var targets = config._targets = {};
	logger.log('debug', '======================================================================');
	logger.log('debug', 'Processing targets...');
	logger.log('debug', '----------------------------------------------------------------------');
	Object.keys(config.routing.routes).map(function (routeKey) {
		return config.routing.routes[routeKey].target;
	}).reduce(function (a, b) {
		return a ? a.concat(b) : [].concat(b);
	}).filter(function (serverKey) {
		if (serverKey.match(/^https?:\/\//gi)) {
			logger.log('debug', '"' + serverKey + '" target accepted, static route');
			return true;
		}

		var vms = config.vms[serverKey];
		if (vms) {
			if (vms.location !== hostConfig.location) {
				logger.log('debug', '"' + serverKey + '" target accepted (vms), external location - ' + vms.location);
				vms.external = true;
				return true;
			}
			logger.log('debug', '"' + serverKey + '" target accepted (vms)');
			return true;
		}

		var server = config.servers[serverKey];
		if (server) {
			if (server.location !== hostConfig.location) {
				logger.log('debug', '"' + serverKey + '" target accepted (servers), external location - ' + vms.location);
				server.external = true;
				return true;
			}
			logger.log('debug', '"' + serverKey + '" target accepted (servers)');
			return true;
		}

		logger.log('debug', '"' + serverKey + '" target is not in the list(servers+vms)');
		return false;
	}).forEach(function (serverKey) {
		if (targets[serverKey]) {
			return;
		}

		if (serverKey.match(/^https?:\/\//gi)) {
			targets[serverKey] = serverKey;
		}

		var server = config.servers[serverKey];
		if (server) {
			targets[serverKey] = server;
		}

		var vms = config.vms[serverKey];
		if (vms) {
			targets[serverKey] = vms;
		}
	});
	logger.log('info', 'Accepted targets:', Object.keys(targets).join(', '));

	var targetsVirtual = config._targetsVirtual = {};
	logger.log('debug', '======================================================================');
	logger.log('debug', 'Processing virtual targets...');
	logger.log('debug', '----------------------------------------------------------------------');
	Object.keys(config.routing.routes).forEach(function (routeKey) {
		if (targets[routeKey]) {
			return;
		}
		var route = config.routing.routes[routeKey];
		if (typeof route.target === 'string') {
			targetsVirtual[routeKey] = [route.target];
		} else if (typeof route.target === 'object') {
			route.target.forEach(function (targetKey) {
				if (targets[targetKey]) {
					logger.log('debug', '"' + routeKey + '" route has a target ' + targetKey);
					var target = targets[targetKey];
					target.key = targetKey;
					if (!targetsVirtual[routeKey]) {
						targetsVirtual[routeKey] = [target];
					} else {
						targetsVirtual[routeKey].push(target);
					}
				} else {
					logger.log('debug', '"' + routeKey + '" route, target "' + targetKey + '" not found, skipped');
				}
			});
		}
	});
	logger.log('info', 'Accepted virtual targets:', Object.keys(targetsVirtual).join(', '));

	var routes = config._routes = {};
	logger.log('debug', '======================================================================');
	logger.log('debug', 'Processing routes...');
	logger.log('debug', '----------------------------------------------------------------------');
	Object.keys(config.routing.routes).forEach(function (routeKey) {
		var route = config.routing.routes[routeKey];
		if (typeof route.target === 'string') {
			if (targets[route.target]) {
				logger.log('debug', '"' + routeKey + '" route has a target ' + route.target);
				routes[routeKey] = [targets[route.target]];
				if (config._hostConfig.location === targets[route.target].location) {
					route.localLocation = true;
				}
			} else if (targetsVirtual[route.target]) {
				logger.log('debug', '"' + routeKey + '" route has a linked target ' + route.target);
				routes[routeKey] = targetsVirtual[route.target];
				var locations = targetsVirtual[route.target].map(function (item) {
					return item.location;
				});
				if (~locations.indexOf(config._hostConfig.location)) {
					route.localLocation = true;
				}
			} else {
				logger.log('debug', '"' + routeKey + '" route, target "' + route.target + '" not found, skipped');
			}
		} else if (typeof route.target === 'object') {
			route.target.forEach(function (targetKey) {
				if (targets[targetKey]) {
					logger.log('debug', '"' + routeKey + '" route has a target ' + targetKey);
					var target = targets[targetKey];
					target.key = targetKey;
					if (!routes[routeKey]) {
						routes[routeKey] = [target];
					} else {
						routes[routeKey].push(target);
					}
					if (config._hostConfig.location === target.location) {
						route.localLocation = true;
					}
				} else if (targetsVirtual[route.target]) {
					logger.log('debug', '"' + routeKey + '" route has a linked target ' + route.target);
					var target = targetsVirtual[targetKey];
					target.key = targetKey;
					if (!routes[routeKey]) {
						routes[routeKey] = [target];
					} else {
						routes[routeKey].push(target);
					}
					var locations = target.map(function (item) {
						return item.location;
					});
					if (~locations.indexOf(config._hostConfig.location)) {
						route.localLocation = true;
					}
				} else {
					logger.log('debug', '"' + routeKey + '" route, target "' + targetKey + '" not found, skipped');
				}
			});
		} else {
			logger.log('debug', '"' + routeKey + '" route has no target, skipped');
		}
	});
	logger.log('info', 'Accepted routes:', Object.keys(routes).join(', '));

	if (!Object.keys(routes).length) {
		logger.error('routes length is zero');
		process.exit();
	}

	if (argv.o) {
		var outputPath = config._outputPath = path.normalize(argv.o);
		if (!fs.existsSync(outputPath)) {
			fs.mkdirSync(outputPath);
		}
	} else {
		config._outputPath = path.normalize(temp.mkdirSync('beaver-output'));
	}
};

var keys = ['test', 'servers', 'routing', 'locations', 'vms'];
config.set = function (data) {
	keys.forEach(function (key) {
		config[key] = data[key];
	});
	config.parse();
};

if (argv.i) {
	var configPath = path.resolve(argv.i);
	config.readFile = function () {
		config.set(JSON.parse(fs.readFileSync(configPath, 'UTF-8')));
	};
	config.readFile();
}

module.exports = config;
