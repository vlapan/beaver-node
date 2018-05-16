const logLevelNames = ['info', 'debug', 'verbose', 'silly'];

let level = logLevelNames[0];

const argv = require(`${__dirname}/argv`);
const levelOption = argv.v | 0;
if (levelOption) {
    level = levelOption > logLevelNames.length - 1 ? logLevelNames[logLevelNames.length - 1] : logLevelNames[levelOption];
}

const winston = require('winston');

winston.cli();

const logger = new winston.Logger({
    transports: [
        new winston.transports.Console({
            level,
        }),
    ],
    exitOnError: false,
});
logger.cli();

module.exports = logger;
