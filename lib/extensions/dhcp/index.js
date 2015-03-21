"use strict";

var fs = require('fs');
var path = require('path');

var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

var isMacAddress = /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/i;

module.exports = {
	generate: function (callback) {
		logger.log('info', '======================================================================');
		logger.log('info', 'DHCP configutation generation');
		logger.log('info', '----------------------------------------------------------------------');

		var dhcpdHosts = path.normalize(config._outputPath + '/dhcpd.hosts');
		fs.openSync(dhcpdHosts, 'w');

		var hosts = {};

		function addHost(item) {
			if (item.location !== config._hostConfig.location) {
				return;
			}
			if (item.lan && isMacAddress.exec(item.lan.mac)) {
				item.lan.name = item.key;
				hosts[item.key + '_lan'] = item.lan;
			}
			if (item.wan && isMacAddress.exec(item.wan.mac)) {
				item.wan.name = item.key;
				item.wan.wan = true;
				if (item.lan) {
					item.lan.wan = true;
				}
				hosts[item.key + '_wan'] = item.wan;
			}
		}

		var keys = Object.keys(config.servers);
		for (var i = 0, till = keys.length; i < till; i++) {
			var key = keys[i];
			var item = config.servers[key];
			item.key = key;
			addHost(item);
		}

		var routers = [];
		var keys = Object.keys(config.vms);
		for (var i = 0, till = keys.length; i < till; i++) {
			var key = keys[i];
			var item = config.vms[key];
			item.key = key;
			addHost(item);
			if (item.location === config._hostConfig.location && item.router === 'active') {
				routers.push(item.lan.ip);
			}
		}

		var output = 'option domain-name-servers ' + routers.join(', ') + ';\n';
		var routing = config.locations[config._hostConfig.location].routing;
		var keys = Object.keys(hosts);
		for (var i = 0, till = keys.length; i < till; i++) {
			var key = keys[i];
			var item = hosts[key];
			logger.log('debug', '"' + key + '" host, mac: ' + item.mac + ' = ip: ' + item.ip);
			output += 'host ' + key + ' {';
			output += ' server-name "' + item.name + '";';
			if (item.wan !== true && routing && routing.gateway) {
				output += ' option routers ' + routing.gateway + ';';
			}
			output += ' hardware ethernet ' + item.mac + ';';
			output += ' fixed-address ' + item.ip + ';';
			output += ' }\n';
		}

		fs.writeFileSync(dhcpdHosts, output, 'UTF-8');
		logger.log('info', '"' + dhcpdHosts + '" done');

		callback && callback(null, true);
	}
};
