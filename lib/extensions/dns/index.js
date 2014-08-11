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
			if (config._hostConfig.location === config.vms[key].location) {
				ns.push(key + '.');
			}
		});
		Object.keys(config._routes).forEach(function (route, index) {
			var routePath = path.normalize(zonesPath + '/' + route + '.dns');
			fs.openSync(routePath, 'w');

			var output = zonefile.generate({
				$origin: route + '.',
				$ttl: 3600,
				soa: {
					mname: route + '.',
					rname: route + '.',
					serial: '{time}',
					refresh: 3600,
					retry: 600,
					expire: 604800,
					minimum: 86400
				},
				ns: ns,
				a: {
					'@': config._hostConfig.wan.ip,
					'*': config._hostConfig.wan.ip
				}
			});

			fs.writeFileSync(routePath, output, 'UTF-8');
		});
	}
};
