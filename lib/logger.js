var logLevelNames = ['info', 'debug', 'verbose', 'silly'];

var level = logLevelNames[0];

var argv = require(__dirname + '/argv');
var levelOption = argv.v | 0;
if (levelOption) {
	level = levelOption > logLevelNames.length - 1 ? logLevelNames[logLevelNames.length - 1] : logLevelNames[levelOption];
}

var winston = require('winston');
winston.cli();

var logger = new winston.Logger({
	transports: [
		new winston.transports.Console({
			level: level
		})
	],
	exitOnError: false
});
logger.cli();

module.exports = logger;
