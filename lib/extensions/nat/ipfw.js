var fs = require('fs');

var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

module.exports = {
	generate: function (callback) {
		var ipfw = '';

		logger.log('info', '======================================================================');
		logger.log('info', 'Ipnat configutation generation');
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
				var redirect = 'ipfw add fwd ' + config._hostConfig.wan.ip + ',' + portSrc + ' tcp from any to ' + vm.lan.ip + ' dst-port ' + portTgt;
				logger.log('debug', 'append rule:', redirect);
				ipfw += redirect + '\n';
			});
		});
		fs.writeFileSync(config._outputPath + '/ipfw.sh', ipfw, 'UTF-8');
		logger.log('info', 'ipfw.sh done!');

		callback && callback(null, true);
	}
};
