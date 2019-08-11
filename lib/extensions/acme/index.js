const fs = require('fs');

const config = require(`${__dirname  }/../../configuration`);
const logger = require(`${__dirname  }/../../logger`);

module.exports = {
    generate (callback) {
        logger.log('info', '======================================================================');
        logger.log('info', 'ACME configuration generation');
        logger.log('info', '----------------------------------------------------------------------');

        const acme = {};

        let forcedLeader;

        for (let router of config.parser.routers.list) {
            if (router.acme === true) {
                forcedLeader = router;
                break;
            } else if (forcedLeader === undefined && router.isActive) {
                forcedLeader = router;
            }
        }

        if (!forcedLeader) {
            logger.log('error', `acme: errors: 'no active router found!'`);
            callback && callback(null, true);
            return;
        }

        acme.leader = forcedLeader.key;
        acme.active = config.parser.router.key === forcedLeader.key;
        logger.log('info', `acme: leader: '${acme.leader}'`);

        fs.writeFile(`${config._outputPath}/acme.json`, JSON.stringify(acme, null, 4), function (err) {
            callback && callback(err, true);
        });

    }
};
