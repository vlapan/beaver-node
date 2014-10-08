var fs = require('fs');
var path = require('path');

var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

var zonefile = require('dns-zonefile');

module.exports = {
	generate: function (callback) {
		var zonesPath = path.normalize(config._outputPath + '/dns');
		if (!fs.existsSync(zonesPath)) {
			fs.mkdirSync(zonesPath);
		}

		logger.log('info', '======================================================================');
		logger.log('info', 'DNS configutation generation');
		logger.log('info', '----------------------------------------------------------------------');
		var ns = [];
		var routers = [];
		Object.keys(config.vms).forEach(function (key, index) {
			if (config.vms[key].router === 'active') {
				ns.push({
					host: key + '.'
				});
				if (config._hostConfig.location && config.vms[key].location !== config._hostConfig.location) {
					return;
				}
				routers.push(config.vms[key].wan.ip);
			}
		});
		if (~routers.indexOf(config._hostConfig.wan.ip)) {
			routers = [config._hostConfig.wan.ip];
		}

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
		var myIp = config._hostConfig.wan && config._hostConfig.wan.ip || config.locations[config._hostConfig.location].ext.web.ip;

		function add(type, key) {
			var zone = key;
			domains.forEach(function (domain) {
				var re = new RegExp('.' + domain + '$', '');
				zone = key.replace(re, '');
			});

			var item = config[type][key];

			if (Array.isArray(item)) {
				var targets = [];
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
						if (target.wan) {
							targets.push(target.wan.ip);
						} else {
							routers.forEach(function(ip) {
								targets.push(ip);
							});
						}
					} else {
						targets.push(myIp);
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
			} else {
				if (item.wan) {
					entries.push({
						name: zone,
						ip: item.wan.ip
					});
				} else {
					routers.forEach(function(ip) {
						entries.push({
							name: zone,
							ip: ip
						});
					});
				}
			}
		}

		Object.keys(config._routes).forEach(add.bind(null, '_routes'));
		Object.keys(config.servers).forEach(add.bind(null, 'servers'));
		Object.keys(config.vms).forEach(add.bind(null, 'vms'));

		domains.forEach(function (domain) {
			var routePath = path.normalize(zonesPath + '/' + domain + '.dns');
			fs.openSync(routePath, 'w');

			var a = ([{
				name: '@',
				ip: config._hostConfig.wan.ip
			}, {
				name: '*',
				ip: config._hostConfig.wan.ip
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
		});
		callback && callback(null, true);
	}
};
