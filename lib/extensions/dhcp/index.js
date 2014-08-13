var fs = require('fs');
var path = require('path');

var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');


module.exports = {
	generate: function (callback) {
		logger.log('info', '======================================================================');
		logger.log('info', 'DHCP configutation generation');
		logger.log('info', '----------------------------------------------------------------------');
		var ns = [];
		Object.keys(config.vms).forEach(function (key, index) {
			if (config._hostConfig.location === config.vms[key].location) {
				ns.push(key + '.');
			}
		});

		var dhcpdHosts = path.normalize(config._outputPath + '/dhcpd.hosts');
		fs.openSync(dhcpdHosts, 'w');

		var hosts = {};

		var keys = Object.keys(config.servers);
		for (var i = 0, till = keys.length; i < till; i++) {
			var key = keys[i];
			var item = config.servers[key];
			if (item.location === config._hostConfig.location && item.lan && item.lan.mac.match(/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/gi)) {
				hosts[key] = item.lan;
			}
		}

		var routers = [];
		var keys = Object.keys(config.vms);
		for (var i = 0, till = keys.length; i < till; i++) {
			var key = keys[i];
			var item = config.vms[key];
			if (item.location === config._hostConfig.location && item.lan && item.lan.mac.match(/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/gi)) {
				hosts[key] = item.lan;
			}
			if (item.router) {
				routers.push(key);
			}
		}

		var output = '';

		output += 'option domain-name-servers ' + routers.join(', ') + ';\n';

		var keys = Object.keys(hosts);
		for (var i = 0, till = keys.length; i < till; i++) {
			var key = keys[i];
			var item = hosts[key];
			output += 'host ' + key + ' { server-name "' + key + '"; hardware ethernet ' + item.mac + '; fixed-address ' + item.ip + '; }\n';
		}

		fs.writeFileSync(dhcpdHosts, output, 'UTF-8');
		logger.log('info', '"' + dhcpdHosts + '" done');

		callback && callback(null, true);
	}
};
