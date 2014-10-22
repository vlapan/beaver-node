var fs = require('fs');
var path = require('path');

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

			if (Array.isArray(item)) {
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
									routeRouters = [myIp];
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

				if (~targets.indexOf(myIp)) {
					entries.push({
						name: zone,
						ip: myIp
					});
				} else {
					targets.forEach(function (item) {
						entries.push({
							name: zone,
							ip: item
						});
					});
				}

				if (~targetsLocal.indexOf(myIp)) {
					entriesLocal.push({
						name: zone,
						ip: myIp
					});
				} else {
					targetsLocal.forEach(function (item) {
						entriesLocal.push({
							name: zone,
							ip: item
						});
					});
				}
			} else {
				var sameLocation = typeof item === 'object' && item.location === config._hostConfig.location;
				var localRoute = sameLocation && item.lan;
				if (localRoute) {
					entriesLocal.push({
						name: zone,
						ip: item.lan.ip
					});
				}
				if (item.wan) {
					entries.push({
						name: zone,
						ip: item.wan.ip
					});
					if (!localRoute) {
						entriesLocal.push({
							name: zone,
							ip: item.wan.ip
						});
					}
				} else {
					var routeRouters = routers.slice(0);
					if (sameLocation) {
						var me = routeRouters.filter(function(router) {
							return router.wan.ip === config._hostConfig.wan.ip;
						});
						if (me.length) {
							routeRouters = [myIp];
						} else {
							routeRouters = routeRouters.filter(function(router) {
								return router.location === config._hostConfig.location;
							});
						}
					} else {
						routeRouters = routeRouters.filter(function(router) {
							return router.location === item.location;
						});
					}
					routeRouters.forEach(function (router) {
						entries.push({
							name: zone,
							ip: router.wan.ip
						});
						if (!localRoute) {
							entriesLocal.push({
								name: zone,
								ip: router.wan.ip
							});
						}
					});
				}
			}
		}

		Object.keys(config._routes).forEach(add.bind(null, '_routes'));
		Object.keys(config.servers).forEach(add.bind(null, 'servers'));
		Object.keys(config.vms).forEach(add.bind(null, 'vms'));

		function generateFile(domain, routePath, entries) {
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
			generateFile(domain, path.normalize(zonesGlobalPath + '/' + domain + '.dns'), entries);
			generateFile(domain, path.normalize(zonesLocalPath + '/' + domain + '.dns'), entriesLocal);
		});

		callback && callback(null, true);
	}
};
