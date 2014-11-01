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
			var sameLocation = false;
			for (var i = 0, till = item.length; i < till; i++) {
				var target = item[i];
				if (typeof target === 'object' && target.location === config._hostConfig.location) {
					sameLocation = true;
					break;
				}
			}
			for (var i = 0, till = item.length; i < till; i++) {
				var target = item[i];
				if (sameLocation && target.location !== config._hostConfig.location) {
					continue;
				}
				if (typeof target === 'object') {
					var localRoute = sameLocation && target.lan;
					if (localRoute) {
						targetsLocal.push(target.lan.ip);
					}
					if (target.wan) {
						targets.push(target.wan.ip);
						if (!localRoute) {
							targetsLocal.push(target.wan.ip);
						}
					} else {
						var routeRouters = routers.slice(0);
						if (sameLocation) {
							var me = routeRouters.filter(function(router) {
								return router.wan.ip === config._hostConfig.wan.ip;
							});
							if (me.length) {
								routeRouters = [config._hostConfig];
							} else {
								routeRouters = routeRouters.filter(function(router) {
									return router.location === config._hostConfig.location;
								});
							}
						} else {
							routeRouters = routeRouters.filter(function(router) {
								return router.location === target.location;
							});
						}
						routeRouters.forEach(function (router) {
							targets.push(router.wan.ip);
							if (!localRoute) {
								targetsLocal.push(router.wan.ip);
							}
						});
					}
				} else {
					targets.push(myIp);
					targetsLocal.push(myIp);
				}
			}

			targets = Hoek.unique(targets);

			targets.forEach(function (item) {
				entries.push({
					name: zone,
					ip: item
				});
			});

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
				$ttl: 2400,
				soa: {
					mname: domain + '.',
					rname: domain + '.',
					serial: '{time}',
					refresh: 900,
					retry: 300,
					expire: 86400,
					minimum: 2400
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
				$ttl: 2400,
				soa: {
					mname: key + '.',
					rname: key + '.',
					serial: '{time}',
					refresh: 900,
					retry: 300,
					expire: 86400,
					minimum: 2400
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
