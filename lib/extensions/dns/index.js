"use strict";

var fs = require('fs');
var path = require('path');

var Hoek = require('hoek');

var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

var zonefile = require('dns-zonefile');

module.exports = {
	generate: function (callback) {
		logger.log('info', '======================================================================');
		logger.log('info', 'DNS configutation generation');
		logger.log('info', '----------------------------------------------------------------------');

		var options = config.routing.options && typeof config.routing.options.dns === 'object' ? config.routing.options.dns : {};
		if (options.ttl) {
			options.ttl = options.ttl | 0;
		}
		if (!options.ttl) {
			options.ttl = 2400;
		}
		if (options.refresh) {
			options.refresh = options.refresh | 0;
		}
		if (!options.refresh) {
			options.refresh = 900;
		}
		if (options.retry) {
			options.retry = options.retry | 0;
		}
		if (!options.retry) {
			options.retry = 300;
		}
		if (options.expire) {
			options.expire = options.expire | 0;
		}
		if (!options.expire) {
			options.expire = 86400;
		}
		if (options.minimum) {
			options.minimum = options.minimum | 0;
		}
		if (!options.minimum) {
			options.minimum = 2400;
		}

		var zonesPath = path.normalize(config._outputPath + '/dns');
		if (!fs.existsSync(zonesPath)) {
			fs.mkdirSync(zonesPath);
		}
		var zonesGlobalPath = path.normalize(config._outputPath + '/dns/global');
		if (!fs.existsSync(zonesGlobalPath)) {
			fs.mkdirSync(zonesGlobalPath);
		}
		var zonesLocalPath = path.normalize(config._outputPath + '/dns/local');
		if (!fs.existsSync(zonesLocalPath)) {
			fs.mkdirSync(zonesLocalPath);
		}

		var ns = [];
		var routers = [];
		Object.keys(config.vms).forEach(function (key, index) {
			if (config.vms[key].router === 'active') {
				ns.push({
					host: key + '.'
				});
				routers.push(config.vms[key]);
			}
		});

		var routersFiltered = routers.slice(0);
		routersFiltered = routersFiltered.filter(function(router) {
			return router.location === config._hostConfig.location;
		});

		var domains = [];
		Object.keys(config.routing.domains).forEach(function (domainKey) {
			var domain = config.routing.domains[domainKey];
			if (!domain.publish || domain.publish !== true) {
				return;
			}
			domains.push(domainKey.replace(/^./, ''));
		});

		if (!domains.length) {
			callback && callback('No domains provided.');
			return;
		}

		var entries = [];
		var entriesLocal = [];
		var myIp = config._hostConfig.wan && config._hostConfig.wan.ip || config.locations[config._hostConfig.location].ext.web.ip;

		function add(type, key) {
			var dnsType = config.routing.routes[key] && config.routing.routes[key].dns;
			var zone = key;
			domains.forEach(function (domain) {
				var re = new RegExp('.' + domain + '$', '');
				zone = zone.replace(re, '');
			});

			var item = config[type][key];
			if (!Array.isArray(item)) {
				item = [].concat(item);
			}
			var targets = [];
			var targetsLocal = [];
			for (var i = 0, till = item.length; i < till; i++) {
				var target = item[i];

				if (typeof target !== 'object') {
					targets.push(myIp);
					targetsLocal.push(myIp);
					continue;
				}

				var sameLocation = typeof target === 'object' && target.location === config._hostConfig.location;
				if (sameLocation && dnsType === 'remote' || !sameLocation && dnsType === 'local') {
					continue;
				}

				var localRoute = sameLocation && target.lan;
				if (localRoute) {
					if (item.length === 1) {
						targetsLocal = [target.lan.ip];
					} else {
						targetsLocal = [];
						routersFiltered.forEach(function (router) {
							targetsLocal.push(router.lan.ip);
						});
					}
				}
				if (target.wan && (!config.routing.routes[key] || dnsType === 'use-wan')) {
					targets.push(target.wan.ip);
					if (!localRoute) {
						targetsLocal.push(target.wan.ip);
					}
				} else {
					var routeRouters = routers.filter(function(router) {
						return router.location === target.location;
					});
					var empty = !targetsLocal.length;
					routeRouters.forEach(function (router) {
						targets.push(router.wan.ip);
						if (!localRoute && empty) {
							targetsLocal.push(router.wan.ip);
						}
					});
				}
			}

			targets = Hoek.unique(targets);
			targets.forEach(function (item) {
				entries.push({
					name: zone,
					ip: item
				});
			});

			targetsLocal = Hoek.unique(targetsLocal);
			targetsLocal.forEach(function (item) {
				entriesLocal.push({
					name: zone,
					ip: item
				});
			});
		}

		Object.keys(config._routes).forEach(add.bind(null, '_routes'));

		var localRoutes = Hoek.clone(entriesLocal);

		Object.keys(config.servers).forEach(add.bind(null, 'servers'));
		Object.keys(config.vms).forEach(add.bind(null, 'vms'));

		function generateDomainFile(domain, routePath, entries) {
			fs.openSync(routePath, 'w');

			var a = ([{
				name: '@',
				ip: myIp
			}, {
				name: '*',
				ip: myIp
			}]).concat(entries);

			var output = zonefile.generate({
				$origin: domain + '.',
				$ttl: options.ttl,
				soa: {
					mname: domain + '.',
					rname: domain + '.',
					serial: '{time}',
					refresh: options.refresh,
					retry: options.retry,
					expire: options.expire,
					minimum: options.minimum
				},
				ns: ns,
				a: a
			});

			fs.writeFileSync(routePath, output, 'UTF-8');
			logger.log('info', '"' + routePath + '" done');
		}

		domains.forEach(function (domain) {
			generateDomainFile(domain, path.normalize(zonesGlobalPath + '/' + domain + '.dns'), entries);
			generateDomainFile(domain, path.normalize(zonesLocalPath + '/' + domain + '.dns'), entriesLocal);
		});


		var localRoutesGrouped = [];
		for (var i = 0, till = localRoutes.length; i < till; i++) {
			var entry = localRoutes[i];
			var group = localRoutesGrouped[entry.name];
			if (!group) {
				localRoutesGrouped[entry.name] = [entry.ip];
			} else {
				group.push(entry.ip);
			}
		}

		function generateRouteFile(key, addresses) {
			var routePath = path.normalize(zonesLocalPath + '/' + key + '.dns');
			fs.openSync(routePath, 'w');

			var a = [];
			addresses.forEach(function(address) {
				a.push({
					name: '@',
					ip: address
				});
				a.push({
					name: '*',
					ip: address
				});
			});

			var output = zonefile.generate({
				$origin: key + '.',
				$ttl: options.ttl,
				soa: {
					mname: key + '.',
					rname: key + '.',
					serial: '{time}',
					refresh: options.refresh,
					retry: options.retry,
					expire: options.expire,
					minimum: options.minimum
				},
				ns: ns,
				a: a
			});

			fs.writeFileSync(routePath, output, 'UTF-8');
			logger.log('info', '"' + routePath + '" done');
		}

		Object.keys(localRoutesGrouped).forEach(function (key) {
			generateRouteFile(key, localRoutesGrouped[key]);
		});

		callback && callback(null, true);
	}
};
