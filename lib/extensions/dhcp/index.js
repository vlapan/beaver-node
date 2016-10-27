"use strict";

var fs = require('fs');
var path = require('path');

var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

var isMacAddress = /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/i;

function compare(string1, string2) {
	var l = Math.min(string1.length, string2.length);
	for (var i = 0; i < l; i++) {
		if (string1.charAt(i) !== string2.charAt(i)) {
			return i;
		}
	}
	return l;
}

module.exports = {
	generate: function (callback) {
		logger.log('info', '======================================================================');
		logger.log('info', 'DHCP configutation generation');
		logger.log('info', '----------------------------------------------------------------------');

		var dhcpdHosts = path.normalize(config._outputPath + '/dhcpd.hosts');
		fs.openSync(dhcpdHosts, 'w');

		var routers = [];
		var keys = Object.keys(config._routers);
		for (var i = 0, till = keys.length; i < till; i++) {
			var key = keys[i];
			var item = config._routers[key];
			if (item.location === config._hostConfig.location && item.router === 'active') {
				routers.push(item.lan.ip);
			}
		}

		var routing = config.locations[config._hostConfig.location].routing;
		var output = 'option domain-name-servers ' + routers.join(', ') + ';\n';

		function processItem(iface, server) {
			var key = server.key + '_' + iface.type;
			logger.log('debug', '"' + key + '" host, mac: ' + iface.mac + ' = ip: ' + iface.ip);
			var output = 'host ' + key + ' {';
			output += ' option host-name "' + server.key + '";';

			var gateway = routing && routing.gateway ? (Array.isArray(routing.gateway) ? routing.gateway.reduce(function (a, b) {
				var c = compare(iface.ip, b);
				if (a.lcp < c) {
					a.lcp = c;
					a.value = b;
				}
				return a;
			}, {
				lcp: 0,
				value: ''
			}).value : routing.gateway) : false;
			if (gateway) {
				if (iface.skipRouter !== true) {
					output += ' option routers ' + gateway + ';';
				}
				const gw = gateway.replace(/\./gi, ', ');
				if (server.net) {
					output += ' option rfc3442-classless-static-routes ';
					var first = true;
					for (var key of Object.keys(config._hosts)) {
						var host = config._hosts[key];
						if (host.lan && host.lan.ip && host.location !== server.location && host.net === server.net) {
							output += (first ? '' : ', ') + '32, ' + host.lan.ip.replace(/\./gi, ', ') + ', ' + gw;
							first = false;
						}
					}
					if (iface.skipRouter !== true) {
						output += ', 0, ' + gw + ';';
					} else {
						output += ';';
					}
				}
			}

			output += ' hardware ethernet ' + iface.mac + ';';
			output += ' fixed-address ' + iface.ip + ';';
			output += ' }\n';
			return output;
		}

		var keys = Object.keys(config._hosts);
		for (var i = 0, till = keys.length; i < till; i++) {
			var key = keys[i];
			var item = config._hosts[key];

			if (item.location !== config._hostConfig.location) {
				continue;
			}

			var wanExists = !!(item.wan && isMacAddress.exec(item.wan.mac));
			var lanExists = !!(item.lan && isMacAddress.exec(item.lan.mac));

			if (lanExists) {
				item.lan.skipRouter = wanExists;
				item.lan.type = 'lan';
				output += processItem(item.lan, item);
			}
			if (wanExists) {
				item.wan.skipRouter = true;
				item.wan.type = 'wan';
				output += processItem(item.wan, item);
			}
		}

		fs.writeFileSync(dhcpdHosts, output, 'UTF-8');
		logger.log('info', '"' + dhcpdHosts + '" done');

		callback && callback(null, true);
	}
};
