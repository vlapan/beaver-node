const argv = require('./argv');
const levelOption = argv.v | 0;

// const winston = require('winston');
// const logLevelNames = ['info', 'debug', 'verbose', 'silly'];
// let level = logLevelNames[0];
// if (levelOption) {
//     level = levelOption > logLevelNames.length - 1 ? logLevelNames[logLevelNames.length - 1] : logLevelNames[levelOption];
// }
// const logger = winston.createLogger({
//     transports: [
//         new winston.transports.Console({
//             level,
//             format: winston.format.combine(
//                 winston.format.colorize(),
//                 winston.format.simple(),
//             ),
//         }),
//     ],
//     exitOnError: false,
// });

const logger = {
    log: function (l, v) {
        if (levelOption) {
            console.log(l, v);
        }
    },
};

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
