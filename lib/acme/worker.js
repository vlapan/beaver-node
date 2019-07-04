const async = require('async');

function shutdown() {
    process.exit();
}
process.on('disconnect', shutdown);

function parse(config) {
    if (typeof config !== 'object') {
        process.send({
            error: 'no config',
        }, shutdown);
        return;
    }

    // if (!config.tests.length) {
    //     process.send({
    //         error: 'no tests',
    //     }, shutdown);
    //     return;
    // }

    // const tasks = [];

    // config.tests.forEach((service) => {
    //     tasks.push(function (callback) {
    //         console.log('asdfdsaf');
    //         callback(null, true);
    //     });
    // });

    // async.parallel(tasks, (err, result) => {
    //     if (!process.connected) {
    //         shutdown();
    //     }
    //     if (err) {
    //         process.send({
    //             error: err,
    //         }, shutdown);
    //     } else {
    //         process.send({
    //             result,
    //         }, shutdown);
    //     }
    // });
}

process.on('message', parse);
