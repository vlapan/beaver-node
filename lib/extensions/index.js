var async = require('async');

var argv = require(__dirname + '/../argv');
var logger = require(__dirname + '/../logger');
var extensionsEnabled = argv.e.split(',');

module.exports = {
	list: {
		nat: require(__dirname + '/nat'),
		www: require(__dirname + '/www'),
		dns: require(__dirname + '/dns')
	},
	generate: function(callback) {
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

		async.series(extensions, function(err, result) {
			logger.log('info', '======================================================================');
			logger.log('info', 'CONFIGURATION DONE!');
			logger.log('info', '======================================================================');
			callback && callback(null, true);
		});
	}
};
