"use strict";

var fs = require('fs');

var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

module.exports = {
	generate: function (callback) {
		var ipfw = '';

		logger.log('info', '======================================================================');
		logger.log('info', 'IPFW configutation generation');
		logger.log('info', '----------------------------------------------------------------------');

		var routers = [];
		Object.keys(config.vms).filter(function (vmKey) {
			var vm = config.vms[vmKey];
			return vm.router && vm.tcpShift && vm.location === config._hostConfig.location;
		}).forEach(function (key, index) {
			var vm = config.vms[key];
			if (!vm.router) {
				return;
			}

			var ip = key === config._hostname ? '127.0.0.1' : vm.lan.ip;

			var beaverPortSrc = 2 + (vm.tcpShift | 0);
			var beaverRedirect = ' \\\n    redirect_port tcp ' + ip + ':' + 1001 + ' ' + beaverPortSrc;
			logger.log('debug', 'append rule:', 'redirect_port tcp ' + ip + ':' + 1001 + ' ' + config._hostConfig.wan.ip + ':' + beaverPortSrc);
			ipfw += beaverRedirect;

			var tincdPortSrc = 3 + (vm.tcpShift | 0);
			var tincdRedirect = ' \\\n    redirect_port tcp ' + ip + ':' + 655 + ' ' + tincdPortSrc;
			tincdRedirect += ' \\\n    redirect_port udp ' + ip + ':' + 655 + ' ' + tincdPortSrc;
			logger.log('debug', 'append rule:', 'redirect_port tcp ' + ip + ':' + 655 + ' ' + config._hostConfig.wan.ip + ':' + tincdPortSrc);
			ipfw += tincdRedirect;
		});

		Object.keys(config.vms).filter(function (vmKey) {
			var vm = config.vms[vmKey];
			return vm.type && vm.tcpShift && vm.location === config._hostConfig.location;
		}).forEach(function (vmKey) {
			var vm = config.vms[vmKey];
			var type = vm.type;
			var ports = config.routing.types[type].level3;
			var ip = vmKey === config._hostname ? '127.0.0.1' : vm.lan.ip;
			logger.log('debug', "'" + vmKey + '" host...');
			Object.keys(ports).forEach(function (portSrc) {
				var portTgt = ports[portSrc];
				var redirectType;
				var redirectSplit = portSrc.split('/');
				if (redirectSplit.length > 1) {
					portSrc = redirectSplit[0];
					redirectType = redirectSplit[1];
				}
				portSrc = (portSrc | 0) + (vm.tcpShift | 0);
				var redirect = '';
				if (!redirectType || redirectType === 'tcp') {
					redirect += ' \\\n    redirect_port tcp ' + ip + ':' + portTgt + ' ' + portSrc;
				}
				if (!redirectType || redirectType === 'udp') {
					redirect += ' \\\n    redirect_port udp ' + ip + ':' + portTgt + ' ' + portSrc;
				}
				if (redirect) {
					logger.log('debug', 'append rule:', 'redirect_port tcp ' + ip + ':' + portTgt + ' ' + config._hostConfig.wan.ip + ':' + portSrc);
					ipfw += redirect;
				}
			});
		});

		var output = '#!/bin/sh\n';
		output += 'fw="/sbin/ipfw"\n';

		output += '${fw} nat 1 config ip ' + config._hostConfig.wan.ip + ' unreg_only' + ipfw + '\n';

		output += '${fw} -f pipe flush\n';
		output += '${fw} -f queue flush\n';
		output += '${fw} -f table all flush\n';

		output += '\n\n';

		var local = {};
		var remote = {};

		{
			function addHost(item) {
				if (item.location === config._hostConfig.location) {
					local[item.key] = item;
				} else {
					remote[item.key] = item;
				}
			}

			Object.keys(config.servers).forEach(function (key) {
				var item = config.servers[key];
				item.key = key;
				addHost(item);
			});

			Object.keys(config.vms).forEach(function (key) {
				var item = config.vms[key];
				item.key = key;
				addHost(item);
			});
		}

		function findTapIp(location) {
			const gateways = config.locations[location].routing.gateway;
			for (var key in config.vms) {
				var item = config.vms[key];
				if (item.location === location && item.lan && item.lan.ip && gateways.indexOf(item.lan.ip) !== -1) {
					return item.tap.ip;
				}
			}
			return undefined;
		}

		// output += '${fw} table 5 flush              #  5: remote\n';
		Object.keys(remote).forEach(function (key) {
			const item = remote[key];
			if (item.net && item.lan && item.lan.ip) {
				const tapIp = findTapIp(item.location);
				if (tapIp) {
					output += '${fw} table 5 add ' + item.lan.ip + ' ' + tapIp + '    #    ' + item.net + ': ' + key + '\n';
				}
			}
		});

		// output += '${fw} table 6 flush              #  6: local\n';
		Object.keys(local).forEach(function (key) {
			var item = local[key];
			if (item.net && item.lan && item.lan.ip) {
				output += '${fw} table 6 add ' + item.lan.ip + '    #    ' + item.net + ': ' + key + '\n';
			}
		});

		output += '\n\n';

		output += '${fw} -f flush\n';

		output += '\n\n';

		output += '${fw} add 504 allow tcp from any to me dst-port 22,53,80,443,655 in\n';
		output += '${fw} add 505 allow udp from any to me dst-port 53,655 in\n';
		output += '${fw} add 506 allow tcp from me to not me out\n';
		output += '${fw} add 507 allow udp from me to not me out\n';

		output += '${fw} add 510 skipto 700 ip from 10.0.0.0/8 to 10.0.0.0/8\n';
		output += '${fw} add 520 skipto 700 ip from 172.16.0.0/12 to 172.16.0.0/12\n';
		output += '${fw} add 530 skipto 700 ip from 192.168.0.0/16 to 192.168.0.0/16\n';
		output += '${fw} add 600 nat 1 ip from any to me\n';
		output += '${fw} add 610 nat 1 ip from 10.0.0.0/8 to any\n';
		output += '${fw} add 620 nat 1 ip from 172.16.0.0/12 to any\n';
		output += '${fw} add 630 nat 1 ip from 192.168.0.0/16 to any\n';

		output += '\n\n';

		output += '${fw} add 800 deny icmp from me to \'table(6)\' icmptype 5 in\n';
		output += '${fw} add 800 fwd tablearg ip from \'table(6)\' to \'table(5)\' in\n';

		output += '\n\n';


		output += '${fw} add 900 allow ip from any to any\n';

		fs.writeFileSync(config._outputPath + '/ipfw.sh', output, 'UTF-8');

		logger.log('info', 'ipfw.sh done!');
		callback && callback(null, true);
	}
};
