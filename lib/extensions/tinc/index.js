"use strict";

var fs = require('fs');
var path = require('path');

var Hoek = require('hoek');

var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

module.exports = {
	generate: function (callback) {
		logger.log('info', '======================================================================');
		logger.log('info', 'TINC configutation generation');
		logger.log('info', '----------------------------------------------------------------------');

		var resultPath = path.normalize(config._outputPath + '/tinc');
		if (!fs.existsSync(resultPath)) {
			fs.mkdirSync(resultPath);
		}

		var nets = {};

		function addHost(item) {
			if (item.tap && item.tap.ip) {
				var hosts = nets[item.tap.name];
				if (!hosts) {
					hosts = nets[item.tap.name] = {};
				}
				hosts[item.key] = item.tap;
			}
		}

		Object.keys(config.vms).forEach(function (key, index) {
			if (typeof config.vms[key].router === 'string') {
				var item = config.vms[key];
				item.key = key;
				addHost(item);
			}
		});

		var keys = Object.keys(nets);
		for (var i = 0, till = keys.length; i < till; i++) {
			var net = keys[i];
			var hosts = nets[net];

			var netPath = path.normalize(resultPath + '/' + net);
			if (!fs.existsSync(netPath)) {
				fs.mkdirSync(netPath);
			}

			var hostsPath = path.normalize(netPath + '/hosts');
			if (!fs.existsSync(hostsPath)) {
				fs.mkdirSync(hostsPath);
			}

			var hostsKeys = Object.keys(hosts);
			for (var j = 0, till2 = hostsKeys.length; j < till2; j++) {
				var key = hostsKeys[j];
				var item = hosts[key];

				logger.log('debug', '"' + key + '" host, net: ' + net + ', ip: ' + item.ip);

				var hostFile = '';
				hostFile += 'Address = ' + key + '\n';
				hostFile += 'Subnet = ' + item.ip + '/32' + '\n';
				hostFile += 'Compression = 10' + '\n';
				if (item.key) {
					hostFile += '\n' + item.key + '\n';
				}
				fs.writeFileSync(path.normalize(hostsPath + '/' + key.replace(/\./gi, '_')), hostFile, 'UTF-8');
			}

			function generateTincUpHook(item) {
				var output = '';
				output += '#!/bin/sh\n';
				output += 'echo "tinc: tinc-up hook: NETNAME=$NETNAME NAME=$NAME DEVICE=$DEVICE INTERFACE=$INTERFACE NODE=$NODE REMOTEADDRESS=$REMOTEADDRESS REMOTEPORT=$REMOTEPORT SUBNET=$SUBNET WEIGHT=$WEIGHT"\n';
				output += 'ifconfig $INTERFACE ' + item.ip + ' netmask 255.255.0.0\n';
				output += 'ifconfig $INTERFACE up\n';
				output += 'ifconfig $INTERFACE name ' + item.name + '\n';
				output += '#route add -net 224.0.0.0/4 -interface ' + item.name + ' || echo \'route already exists\'\n';
				fs.writeFileSync(path.normalize(netPath + '/tinc-up'), output, 'UTF-8');
			}
			function generateTincDownHook(item) {
				var output = '';
				output += '#!/bin/sh\n';
				output += 'echo "tinc: tinc-down hook: NETNAME=$NETNAME NAME=$NAME DEVICE=$DEVICE INTERFACE=$INTERFACE NODE=$NODE REMOTEADDRESS=$REMOTEADDRESS REMOTEPORT=$REMOTEPORT SUBNET=$SUBNET WEIGHT=$WEIGHT"\n';
				output += 'ifconfig ' + item.name + ' destroy\n';
				fs.writeFileSync(path.normalize(netPath + '/tinc-down'), output, 'UTF-8');
			}
			if (config._hostConfig.tap) {
				generateTincUpHook(config._hostConfig.tap);
				generateTincDownHook(config._hostConfig.tap);
			}

			function generateTincConfHook() {
				var output = '';
				output += 'Name = ' + config._hostConfig.key.replace(/\./gi, '_') + '\n';
				output += 'Mode = switch\n';
				output += 'ProcessPriority = high\n';
				output += 'Device = /dev/tap\n';

				var hostsKeys = Object.keys(hosts);
				for (var i = 0, till = hostsKeys.length; i < till; i++) {
					var key = hostsKeys[i];
					if (config._hostConfig.key === key) {
						continue;
					}
					output += 'ConnectTo = ' + key.replace(/\./gi, '_') + '\n';
				}
				fs.writeFileSync(path.normalize(netPath + '/tinc.conf'), output, 'UTF-8');
			}
			generateTincConfHook();
		}

		callback && callback(null, true);
	}
};
