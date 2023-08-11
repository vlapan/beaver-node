#!/usr/bin/env node

(async () => {
    process.on('unhandledRejection', error => {
        console.log('unhandledRejection', error);
        process.exitCode = 1;
        process.exit();
    });

    const argv = require('../lib/argv.js');
    const beaverApp = require('../app.js');

    await beaverApp.main(argv);
})();
