var fs = require('fs');
var os = require('os');
var path = require('path');

var argv = require(__dirname + '/lib/argv');
var logger = require(__dirname + '/lib/logger');


var platforms = require(path.normalize(__dirname + '/lib/platforms'));
var platform = os.platform();
if (argv.p) {
	platform = argv.p;
}

if (!~platforms.available.indexOf(platform)) {
	logger.error('"' + platform + '" platform is not available');
	logger.error('try override option "-p freebsd", possible: ' + platforms.available.join(', '));
	process.exit();
}


var config = require(__dirname + '/lib/configuration');

var extensions = require(__dirname + '/lib/extensions');

extensions.generate(function () {
	if (argv.d) {
		function daemonNote() {
			logger.log('info', 'Daemon mode, watching config file "' + argv.i + '"!');
		}
		daemonNote();

		fs.watchFile(path.resolve(argv.i), function (curr, prev) {
			logger.log('info', 'config file, modification detected "' + argv.i + '"!');
			config.reread();
			extensions.generate(daemonNote);
		});
	}
});
