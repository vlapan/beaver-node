"use strict";

var exec = require('child_process').exec;

var async = require('async');

var argv = require(__dirname + '/../argv');
var logger = require(__dirname + '/../logger');
var config = require(__dirname + '/../configuration');
var extensionsEnabled = argv.e.split(',');

module.exports = {
	list: {
		nat: require(__dirname + '/nat'),
		www: require(__dirname + '/www'),
		dns: require(__dirname + '/dns'),
		dhcp: require(__dirname + '/dhcp'),
		monitor: require(__dirname + '/monitor')
	},
	generate: function (callback) {
		var self = this;
		if (self.locked) {
			logger.error('already have some active task!');
			return;
		}
		self.locked = true;

		var extensions = {};

		if (~extensionsEnabled.indexOf('nat')) {
			var nat = this.list.nat[argv.n];
			if (!nat) {
				logger.error('"' + argv.n + '" nat not found, available: ' + Object.keys(this.list.nat).join(', '));
				process.exit();
			}
			extensions['nat'] = nat.generate;
		}

		if (~extensionsEnabled.indexOf('www')) {
			var www = this.list.www[argv.w];
			if (!www) {
				logger.error('"' + argv.w + '" www not found, available: ' + Object.keys(this.list.www).join(', '));
				process.exit();
			}
			extensions['www'] = www.generate;
		}

		if (~extensionsEnabled.indexOf('dns')) {
			extensions['dns'] = this.list.dns.generate;
		}

		if (~extensionsEnabled.indexOf('dhcp')) {
			extensions['dhcp'] = this.list.dhcp.generate;
		}

		if (~extensionsEnabled.indexOf('monitor')) {
			extensions['monitor'] = this.list.monitor.generate;
		}

		async.series(extensions, function (err, result) {
			logger.log('info', '======================================================================');
			logger.log('info', 'CONFIGURATION DONE (' + config._outputPath + ')!');
			logger.log('info', '======================================================================');
			if (!argv.hook) {
				self.locked = false;
				callback && callback(null, true);
				return;
			}
			logger.log('info', 'Executing hook:', argv.hook + ' ' + config._outputPath);
			exec(argv.hook + ' ' + config._outputPath, function (error, stdout, stderr) {
				self.locked = false;
				if (stdout) {
					logger.log('debug', 'hook stdout:', stdout);
				}
				if (error) {
					logger.error('hook', error);
					if (stderr) {
						logger.error('hook stderr:', stderr);
					}
					callback && callback(error + (stderr ? ' // ' + stderr : ''), true);
					return;
				}
				if (~extensionsEnabled.indexOf('monitor')) {
					fs.createReadStream(config._outputPath + '/monitor.json').pipe(fs.createWriteStream(argv.home + '/monitor.json'));
				}
				callback && callback(null, true);
			});
		});
	}
};
