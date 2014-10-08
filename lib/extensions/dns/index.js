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
		Object.keys(config.vms).forEach(function (key, index) {
			if (config.vms[key].router === 'active') {
				ns.push({
					host: key + '.'
				});
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
		var myIp = config._hostConfig.wan && config._hostConfig.wan.ip || config.locations[config._hostConfig.location].ext.web.ip;

		function add(type, key) {
			var zone = key;
			domains.forEach(function (domain) {
				var re = new RegExp('.' + domain + '$', '');
				zone = key.replace(re, '');
			});

			var item = config[type][key];

			if (Array.isArray(item)) {
				var targets = item.map(function (item) {
					if (typeof item === 'string') {
						return myIp;
					} else {
						return (item.wan && item.wan.ip) || (item.lan && item.lan.ip);
					}
				});
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
				entries.push({
					name: zone,
					ip: (item.wan && item.wan.ip) || (item.lan && item.lan.ip)
				});
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
				$ttl: 3600,
				soa: {
					mname: domain + '.',
					rname: domain + '.',
					serial: '{time}',
					refresh: 3600,
					retry: 600,
					expire: 604800,
					minimum: 86400
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
