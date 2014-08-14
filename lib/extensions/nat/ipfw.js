var fs = require('fs');

var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

module.exports = {
	generate: function (callback) {
		var ipfw = '';

		logger.log('info', '======================================================================');
		logger.log('info', 'IPFW configutation generation');
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
				var redirect = ' \\\n    redirect_port tcp ' + vm.lan.ip + ':' + portTgt + ' ' + config._hostConfig.wan.ip + ':' + portSrc;
				logger.log('debug', 'append rule:', 'redirect_port tcp ' + vm.lan.ip + ':' + portTgt + ' ' + config._hostConfig.wan.ip + ':' + portSrc);
				ipfw += redirect;
			});
		});

		var output = '#!/bin/sh\n';
		output += 'fw="/sbin/ipfw"\n';
		output += '${fw} -f flush\n';
		output += '${fw} -f pipe flush\n';
		output += '${fw} -f queue flush\n';
		output += '${fw} -f table all flush\n';

		output += '${fw} nat 1 config ip ' + config._hostConfig.wan.ip + ' unreg_only' + ipfw + '\n';

		output += '${fw} add 500 skipto 900 ip from 172.16.1.0/24 to 172.16.1.0/24\n';
		output += '${fw} add 600 nat 1 ip from any to ' + config._hostConfig.wan.ip + '\n';
		output += '${fw} add 601 nat 1 ip from 172.16.1.0/24 to not 172.16.1.0/24\n';
		output += '${fw} add 900 allow ip from any to any\n';

		fs.writeFileSync(config._outputPath + '/ipfw.sh', output, 'UTF-8');

		logger.log('info', 'ipfw.sh done!');
		callback && callback(null, true);
	}
};
