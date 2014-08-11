var fs = require('fs');
var async = require('async');
var network = require('network');

var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

module.exports = {
	generate: function(callback) {
		async.parallel({
			interfaces: function(callback) {
				network.get_interfaces_list(function (err, interfaces) {
					callback(err, interfaces);
				});
			},
			active: function(callback) {
				network.get_active_interface(function (err, active) {
					callback(err, active);
				});
			}
		}, function(err, result) {
			var natd = '';
			natd += 'port 8668\n';

			logger.log('info', '======================================================================');
			logger.log('info', 'Natd configutation generation');
			logger.log('info', '----------------------------------------------------------------------');

			function findInterfaceByMac(mac) {
				for (var i = 0, till = result.interfaces.length; i < till; i++) {
					var item = result.interfaces[i];
					if (item.mac_address === mac) {
						logger.log('debug', 'interface found, mac: '+ config._hostConfig.wan.mac + ', interface: ' + item.name);
						return item.name;
					}
				}
				logger.log('warn', 'no interface found, mac: '+ config._hostConfig.wan.mac + ', using active interface: ' + result.active.name);
				return result.active.name;
			}
			var networkInterface = findInterfaceByMac(config._hostConfig.wan.mac);
			natd += 'interface ' + networkInterface + '\n';

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
					var redirect = 'redirect_port tcp ' + config._hostConfig.wan.ip + ':' + portSrc + ' ' + vm.lan.ip + ':' + portTgt;
					logger.log('debug', 'append rule:', redirect);
					natd += redirect + '\n';
				});
			});
			fs.writeFileSync(config._outputPath + '/natd.conf', natd, 'UTF-8');
			logger.log('info', 'natd.conf done!');

			callback && callback(null, true);
		});
	}
};
