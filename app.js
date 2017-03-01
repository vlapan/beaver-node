"use strict";

var argv = require(__dirname + '/lib/argv');
var logger = require(__dirname + '/lib/logger');

var config = require(__dirname + '/lib/configuration');
var extensions = require(__dirname + '/lib/extensions');

function fileDaemonNote() {
	logger.log('info', 'input: daemon mode, watching config file "' + argv.input + '"!');
}

function daemonStart(err) {
	if (!argv.daemon || err) {
		return;
	}

	if (argv.input) {
		fileDaemonNote();
		config.watch(function () {
			extensions.generate(fileDaemonNote);
		});
	}

	require(__dirname + '/lib/https');

	var extensionsEnabled = argv.e.split(',');
	if (~extensionsEnabled.indexOf('monitor')) {
		var Overseer = require('./lib/overseer/overseer');
		var overseer = new Overseer({
			data: argv.home + '/monitor.json',
			result: argv.home + '/monitor-result.txt',
			interval: 10000,
			tcpTimeout: 5000,
			webTimeout: 10000
		});
		overseer.start();
	}

	if (argv.discover) {
		require(__dirname + '/lib/discovery');
	}
}

if (argv.input) {
	extensions.generate(daemonStart);
} else if (argv.daemon) {
	daemonStart();
}
