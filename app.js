var fs = require('fs');
var os = require('os');
var path = require('path');

var argv = require(__dirname + '/lib/argv');
var logger = require(__dirname + '/lib/logger');

var config = require(__dirname + '/lib/configuration');
var extensions = require(__dirname + '/lib/extensions');

function daemonStart() {
	if (!argv.daemon) {
		return;
	}
	if (argv.input) {
		function fileDaemonNote() {
			logger.log('info', 'Daemon mode, watching config file "' + argv.input + '"!');
		}
		fileDaemonNote();
		config.watch(function () {
			extensions.generate(fileDaemonNote);
		});
	}
	require(__dirname + '/lib/https');
}

if (argv.input) {
	extensions.generate(daemonStart);
} else if (argv.daemon) {
	daemonStart();
}
