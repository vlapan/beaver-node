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
		logger.log('info', 'HOSTS configutation generation');
		logger.log('info', '----------------------------------------------------------------------');

		var routers = [];
		Object.keys(config.vms).forEach(function (key, index) {
			if (config.vms[key].router === 'active') {
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

		var entriesLan = [];

		function add(type, key) {
			var dnsType = config.routing.routes[key] && config.routing.routes[key].dns;
			var zone = key;
			var domainFound = false;
			domains.forEach(function (domain) {
				var re = new RegExp('.' + domain.key + '$', '');
				zone = zone.replace(re, function (m1) {
					domainFound = true;
					return '';
				});
			});

			var item = config[type][key];
			if (!Array.isArray(item)) {
				item = [].concat(item);
			}
			var targets = [];
			var skip = item.length > 1;
			for (var i = 0, till = item.length; i < till; i++) {
				var target = item[i];

				if (typeof target !== 'object') {
					continue;
				}

				var sameLocation = typeof target === 'object' && target.location === config._hostConfig.location;
				var localRoute = sameLocation && target.lan;

				if (localRoute) {
					targets.push(target.lan.ip);
				} else {
					if (target.wan && target.wan.ip) {
						targets.push(target.wan.ip);
					}
				}
			}

			targets = Hoek.unique(targets);
			if (!targets.length) {
				return;
			}
			entriesLan.push({
				name: zone,
				ip: targets.join(' '),
				domainFound: domainFound,
				skip: skip
			});
		}

		Object.keys(config._routes).forEach(add.bind(null, '_routes'));
		Object.keys(config.servers).forEach(add.bind(null, 'servers'));
		Object.keys(config.vms).forEach(add.bind(null, 'vms'));

		var outputFile = path.normalize(config._outputPath + '/etc-hosts-generated');

		function generateFile(entries) {
			fs.openSync(outputFile, 'w');

			var max = 0;
			var add = '# skip: '.length;
			entries.forEach(function (entry) {
				if (max < entry.ip.length + (entry.skip ? add : 0)) {
					max = entry.ip.length + (entry.skip ? add : 0);
				}
			});

			var output = '';
			entries.forEach(function (entry) {
				var s = ' ';
				if (entry.ip.length + (entry.skip ? add : 0) < max) {
					s = s + s.repeat(max - entry.ip.length - (entry.skip ? add : 0));
				}
				if (!entry.domainFound) {
					return;
				}
				domains.forEach(function (domain) {
					output += (entry.skip ? '# skip: ' : '') + entry.ip + s + entry.name + '.' + domain.key + '\n';
				});
			});

			fs.writeFileSync(outputFile, output, 'UTF-8');
			logger.log('info', '"' + outputFile + '" done');
		}

		generateFile(entriesLan);

		callback && callback(null, true);
	}
};
