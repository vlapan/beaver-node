var fs = require('fs');
var path = require('path');

var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

var isMacAddress = /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/gi;

module.exports = {
	generate: function (callback) {
		logger.log('info', '======================================================================');
		logger.log('info', 'DHCP configutation generation');
		logger.log('info', '----------------------------------------------------------------------');

		var dhcpdHosts = path.normalize(config._outputPath + '/dhcpd.hosts');
		fs.openSync(dhcpdHosts, 'w');

		var hosts = {};

		function addHost(item) {
			if (item.location === config._hostConfig.location && item.lan && isMacAddress.exec(item.lan.mac)) {
				hosts[key] = item.lan;
			}
		}

		var keys = Object.keys(config.servers);
		for (var i = 0, till = keys.length; i < till; i++) {
			var key = keys[i];
			var item = config.servers[key];
			addHost(item);
		}

		var routers = [];
		var keys = Object.keys(config.vms);
		for (var i = 0, till = keys.length; i < till; i++) {
			var key = keys[i];
			var item = config.vms[key];
			addHost(item);
			if (item.router) {
				routers.push(key);
			}
		}

		var output = 'option domain-name-servers ' + routers.join(', ') + ';\n';
		var keys = Object.keys(hosts);
		for (var i = 0, till = keys.length; i < till; i++) {
			var key = keys[i];
			var item = hosts[key];
			logger.log('debug', '"' + key + '" host, mac: ' + item.mac + ' = ip: ' + item.ip);
			output += 'host ' + key + ' { server-name "' + key + '"; hardware ethernet ' + item.mac + '; fixed-address ' + item.ip + '; }\n';
		}

		fs.writeFileSync(dhcpdHosts, output, 'UTF-8');
		logger.log('info', '"' + dhcpdHosts + '" done');

		callback && callback(null, true);
	}
};
