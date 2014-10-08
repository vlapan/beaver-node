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
		Object.keys(config.routing.domains).forEach(function(domainKey) {
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

		domains.forEach(function (domain) {
			var routePath = path.normalize(zonesPath + '/' + domain + '.dns');
			fs.openSync(routePath, 'w');

			var a = [
				{
					name: '@',
					ip: config._hostConfig.wan.ip
				}, {
					name: '*',
					ip: config._hostConfig.wan.ip
				}
			];

			function add(key) {
				domains.forEach(function (domain) {
					var re = new RegExp('.' + domain + '$', '');
					key = key.replace(re, '');
				});
				a.push({
					name: key,
					ip: config._hostConfig.wan.ip
				});
			}

			Object.keys(config._routes).forEach(add);
			Object.keys(config.servers).forEach(add);
			Object.keys(config.vms).forEach(add);

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
