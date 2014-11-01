"use strict";

var fs = require('fs');
var async = require('async');

var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

var interfaces = require(__dirname + '/../../interfaces');

module.exports = {
	generate: function (callback) {
		async.parallel({
			interfaces: function(callback) {
				interfaces(function (err, interfaces) {
					callback(err, interfaces);
				});
			}
		}, function (err, result) {
			var ipnat = '';

			logger.log('info', '======================================================================');
			logger.log('info', 'Ipnat configutation generation');
			logger.log('info', '----------------------------------------------------------------------');

			function findInterfaceByMac(mac) {
				for (var i = 0, till = result.interfaces.length; i < till; i++) {
					var item = result.interfaces[i];
					if (item.mac_address === mac) {
						logger.log('debug', 'interface found, mac: ' + config._hostConfig.wan.mac + ', interface: ' + item.name);
						return item.name;
					}
				}
				logger.log('warn', 'no interface found, mac: '+ config._hostConfig.wan.mac + ', using active interface: ' + result.interfaces[0].name);
				return result.interfaces[0].name;
			}
			var networkInterface = findInterfaceByMac(config._hostConfig.wan.mac);

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
					var redirect = 'rdr ' + networkInterface + ' ' + config._hostConfig.wan.ip + '/255.255.255.255 port ' + portSrc + ' -> ' + vm.lan.ip + ' port ' + portTgt + ' round-robin';
					logger.log('debug', 'append rule:', redirect);
					ipnat += redirect + '\n';
				});
			});
			fs.writeFileSync(config._outputPath + '/ipnat.conf', ipnat, 'UTF-8');
			logger.log('info', 'ipnat.conf done!');

			callback && callback(null, true);
		});
	}
};
