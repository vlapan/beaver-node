const logLevelNames = ['info', 'debug', 'verbose', 'silly'];

let level = logLevelNames[0];

const argv = require(`./argv`);
const levelOption = argv.v | 0;
if (levelOption) {
    level = levelOption > logLevelNames.length - 1 ? logLevelNames[logLevelNames.length - 1] : logLevelNames[levelOption];
}

const winston = require('winston');

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            level,
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple(),
            ),
        }),
    ],
    exitOnError: false,
});

logger.bannerSeparatorBold = '='.repeat(90);
logger.bannerSeparatorLight = '-'.repeat(90);

logger.banner = function (text, last) {
    logger.log('info', logger.bannerSeparatorBold);
    logger.log('info', text);
    if (!last) {
        logger.log('info', logger.bannerSeparatorLight);
    } else {
        logger.log('info', logger.bannerSeparatorBold);
    }
};

module.exports = logger;
