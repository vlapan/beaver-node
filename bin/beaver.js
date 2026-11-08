#!/usr/bin/env node
import argv from '../lib/argv.js';
import beaverApp from '../app.js';

(async () => {
    process.on('unhandledRejection', error => {
        console.log('unhandledRejection', error);
        process.exitCode = 1;
        process.exit();
    });

    await beaverApp.main(argv);
})();
