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
		routersFiltered = routersFiltered.filter(function (router) {
			return router.location === config._hostConfig.location;
		});

		var domains = [];
		Object.keys(config.routing.domains).forEach(function (domainKey) {
			var domain = config.routing.domains[domainKey];
			if (!domain.publish || domain.publish !== true) {
				return;
			}
			domain.key = domainKey.replace(/^./, '');
			domains.push(domain);
		});

		if (!domains.length) {
			callback && callback('No domains provided.');
			return;
		}

		var entriesMap = {};
		var entriesLocalMap = {};

		var hostLocation = config.locations[config._hostConfig.location];
		var hostExternal = hostLocation.routing.external;
		var myIp = hostExternal ? hostExternal : config._hostConfig.wan && config._hostConfig.wan.ip;

		function add(type, key) {
			var dnsType = config.routing.routes[key] && config.routing.routes[key].dns;
			var zone = key;
			domains.forEach(function (domain) {
				var re = new RegExp('.' + domain.key + '$', '');
				zone = zone.replace(re, '');
			});

			var item = [].concat(config[type][key]);
			var targets = [];
			var targetsLocal = [];

			var skipLocal = false;
			for (var i = 0, till = item.length; i < till; i++) {
				var target = item[i];

				if (myIp && typeof target !== 'object') {
					targets = targets.concat(myIp);
					targetsLocal = targetsLocal.concat(myIp);
					continue;
				}

				var sameLocation = typeof target === 'object' && target.location === config._hostConfig.location;
				if (sameLocation && dnsType === 'remote' || !sameLocation && dnsType === 'local') {
					continue;
				}

				var localRoute = sameLocation && target.lan;
				if (localRoute && !skipLocal) {
					if (item.length === 1) {
						targetsLocal = [target.lan.ip];
					} else {
						targetsLocal.push(target.lan.ip);
						if (dnsType !== 'use-wan') {
							targetsLocal = [];
							var location = config.locations[target.location];
							var external = location.routing.external;
							if (external) {
								[].concat(external).forEach(function (item) {
									targetsLocal.push(item);
								});
							}
							skipLocal = true;
						}
					}
				}

				if (target.wan && (!config.routing.routes[key] || dnsType === 'use-wan')) {
					targets.push(target.wan.ip);
					if (!localRoute && !skipLocal) {
						targetsLocal.push(target.wan.ip);
					}
				} else {
					var empty = !targetsLocal.length;
					var routeRouters = routers.filter(function (router) {
						return router.location === target.location;
					});
					routeRouters.forEach(function (router) {
						var location = config.locations[router.location];
						var external = location.routing.external;
						if (external) {
							[].concat(external).forEach(function (item) {
								targets.push(item);
								if (!localRoute && !skipLocal) {
									targetsLocal.push(item);
								}
							});
						} else {
							targets.push(router.wan.ip);
							if (!localRoute && !skipLocal) {
								targetsLocal.push(router.wan.ip);
							}
						}
					});
				}
			}

			targets.forEach(function (item) {
				entriesMap[zone + item] = {
					name: zone,
					ip: item
				};
			});

			targetsLocal.forEach(function (item) {
				entriesLocalMap[zone + item] = {
					name: zone,
					ip: item
				};
			});
		}

		Object.keys(config._routes).forEach(add.bind(null, '_routes'));

		// var localRoutes = Hoek.clone(entriesLocal);

		Object.keys(config.servers).forEach(add.bind(null, 'servers'));
		Object.keys(config.vms).forEach(add.bind(null, 'vms'));

		var entries = Object.values(entriesMap);
		var entriesLocal = Object.values(entriesLocalMap);

		function generateDomainFile(domain, routePath, entries) {
			fs.openSync(routePath, 'w');

			var data = {
				$origin: domain.key + '.',
				$ttl: options.ttl,
				soa: {
					mname: domain.key + '.',
					rname: domain.key + '.',
					serial: '{time}',
					refresh: options.refresh,
					retry: options.retry,
					expire: options.expire,
					minimum: options.minimum
				}
			};
			if (typeof domain.dns === 'object') {
				function transform(obj, keys) {
					var entries = [];
					Object.keys(obj).forEach(function (key) {
						var value = obj[key];
						if (typeof value === 'string') {
							value = [value];
						}
						value.forEach(function (item) {
							var entry = {};
							entry[keys['key'] || 'name'] = key;
							entry[keys['value'] || 'value'] = item;
							entries.push(entry);
						});
					});
					return entries;
				}
				var defaults = {};
				if (typeof domain.dns.NS === 'object') {
					defaults.ns = transform(domain.dns.NS, {
						value: 'host'
					});
				}
				if (typeof domain.dns.A === 'object') {
					defaults.a = transform(domain.dns.A, {
						value: 'ip'
					});
				}
				if (typeof domain.dns.AAAA === 'object') {
					defaults.aaaa = transform(domain.dns.AAAA, {
						value: 'ip'
					});
				}
				if (typeof domain.dns.CNAME === 'object') {
					defaults.cname = transform(domain.dns.CNAME, {
						value: 'alias'
					});
				}
				if (typeof domain.dns.MX === 'object') {
					defaults.mx = transform(domain.dns.MX, {
						key: 'preference',
						value: 'host'
					});
				}
				if (typeof domain.dns.TXT === 'object') {
					defaults.txt = transform(domain.dns.TXT, {
						value: 'txt'
					});
				}
				data = Hoek.merge(defaults, data);
			}
			if (!data.a) {
				data.a = [];
			}
			[].concat(myIp).forEach(function (item) {
				if (typeof domain.dns !== 'object' || typeof domain.dns.A !== 'object' || !domain.dns.A['@']) {
					data.a.push({
						name: '@',
						ip: item
					});
				}
				if (typeof domain.dns !== 'object' || typeof domain.dns.A !== 'object' || !domain.dns.A['*']) {
					data.a.push({
						name: '*',
						ip: item
					});
				}
			});
			if (typeof entries === 'object') {
				data.a = (data.a).concat(entries);
			}
			if (!data.ns) {
				data.ns = ns;
			}
			var output = zonefile.generate(data);

			fs.writeFileSync(routePath, output, 'UTF-8');
			logger.log('info', '"' + routePath + '" done');
		}

		var zonesConf = {
			'local': [],
			'local_slave': [],
			'global': [],
			'global_slave': []
		};
		function printZoneMasterConf(type, domain) {
			var result = '';
			result += 'zone "' + domain.key + '" {\n';
			result += '    type master;\n';
			result += '    file "master/beaver/' + type + '/' + domain.key + '.dns";\n';
			result += '};';
			return result;
		}
		function printZoneSlaveConf(type, domain) {
			var result = '';
			result += 'zone "' + domain.key + '" {\n';
			result += '    type slave;\n';
			result += '    file "slave/beaver/' + type + '/' + domain.key + '.dns";\n';
			result += '    masters { ' + domain.masters.join(';') + '; };\n';
			result += '    allow-transfer { ' + routers.map(function (item) {
				return item.lan.ip;
			}).concat(routers.map(function (item) {
				return item.wan.ip;
			})).join(';') + '; };\n';
			result += '};';
			return result;
		}
		domains.forEach(function (domain) {
			if (domain.mode === 'infrastructure') {
				generateDomainFile(domain, path.normalize(zonesGlobalPath + '/' + domain.key + '.dns'), entries);
				zonesConf.global.push(printZoneMasterConf('global', domain));
				generateDomainFile(domain, path.normalize(zonesLocalPath + '/' + domain.key + '.dns'), entriesLocal);
				zonesConf.local.push(printZoneMasterConf('local', domain));
			} else if (domain.mode === 'dedicated') {
				generateDomainFile(domain, path.normalize(zonesGlobalPath + '/' + domain.key + '.dns'));
				zonesConf.local.push(printZoneMasterConf('global', domain));
			} else if (domain.mode === 'slave') {
				zonesConf.local_slave.push(printZoneSlaveConf('local', domain));
				zonesConf.global_slave.push(printZoneSlaveConf('global', domain));
			}
		});
		fs.writeFileSync(zonesPath + '/local.conf', zonesConf.local.join('\n') + '\n', 'UTF-8');
		fs.writeFileSync(zonesPath + '/local_slave.conf', zonesConf.local_slave.join('\n') + '\n', 'UTF-8');
		fs.writeFileSync(zonesPath + '/global.conf', zonesConf.global.join('\n') + '\n', 'UTF-8');
		fs.writeFileSync(zonesPath + '/global_slave.conf', zonesConf.global_slave.join('\n') + '\n', 'UTF-8');

		// var localRoutesGrouped = [];
		// for (var i = 0, till = localRoutes.length; i < till; i++) {
		// 	var entry = localRoutes[i];
		// 	var group = localRoutesGrouped[entry.name];
		// 	if (!group) {
		// 		localRoutesGrouped[entry.name] = [entry.ip];
		// 	} else {
		// 		group.push(entry.ip);
		// 	}
		// }

		// function generateRouteFile(key, addresses) {
		// 	var routePath = path.normalize(zonesLocalPath + '/' + key + '.dns');
		// 	fs.openSync(routePath, 'w');

		// 	var a = [];
		// 	addresses.forEach(function (address) {
		// 		a.push({
		// 			name: '@',
		// 			ip: address
		// 		});
		// 		a.push({
		// 			name: '*',
		// 			ip: address
		// 		});
		// 	});

		// 	var output = zonefile.generate({
		// 		$origin: key + '.',
		// 		$ttl: options.ttl,
		// 		soa: {
		// 			mname: key + '.',
		// 			rname: key + '.',
		// 			serial: '{time}',
		// 			refresh: options.refresh,
		// 			retry: options.retry,
		// 			expire: options.expire,
		// 			minimum: options.minimum
		// 		},
		// 		ns: ns,
		// 		a: a
		// 	});

		// 	fs.writeFileSync(routePath, output, 'UTF-8');
		// 	logger.log('info', '"' + routePath + '" done');
		// }

		// Object.keys(localRoutesGrouped).forEach(function (key) {
		// 	generateRouteFile(key, localRoutesGrouped[key]);
		// });

		callback && callback(null, true);
	}
};
