"use strict";

var fs = require('fs');
var async = require('async');

var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

module.exports = {
	generate: function (callback) {
		var iptables = '';

		logger.log('info', '======================================================================');
		logger.log('info', 'Iptables configutation generation');
		logger.log('info', '----------------------------------------------------------------------');

		Object.keys(config.vms).filter(function (vmKey) {
			return config.vms[vmKey].type && config.vms[vmKey].tcpShift && vmKey !== config._hostname && config.vms[vmKey].location === config._hostConfig.location;
		}).forEach(function (vmKey) {
			var vm = config.vms[vmKey];
			var type = vm.type;
			var ports = config.routing.types[type].level3;
			logger.log('debug', "'" + vmKey + '" host...');
			Object.keys(ports).forEach(function (portSrc) {
				var portTgt = ports[portSrc];
				portSrc = (portSrc | 0) + (vm.tcpShift | 0);
				var redirect = 'iptables -t nat -A PREROUTING -p tcp -d "' + config._hostConfig.wan.ip + '" --dport "' + portSrc + '" -j DNAT --to-destination "' + vm.lan.ip + ':' + portTgt + '"';
				logger.log('debug', 'append rule:', redirect);
				iptables += redirect + '\n';
			});
		});
		fs.writeFileSync(config._outputPath + '/iptables.dump', iptables, 'UTF-8');
		logger.log('info', 'iptables.conf done!');

		callback && callback(null, true);
	}
};
