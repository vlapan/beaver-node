const argv = require(`${__dirname}/lib/argv`);
const logger = require(`${__dirname}/lib/logger`);

const config = require(`${__dirname}/lib/configuration`);
const extensions = require(`${__dirname}/lib/extensions`);

function fileDaemonNote() {
    logger.log('info', `input: daemon mode, watching config file "${argv.input}"!`);
}

function daemonStart(err) {
    if (!argv.daemon || err) {
        process.exit();
        return;
    }

    if (argv.input) {
        fileDaemonNote();
        config.watch(() => {
            extensions.generate(fileDaemonNote);
        });
    }

    require(`${__dirname}/lib/https`);

    const extensionsEnabled = argv.e.split(',');
    if (~extensionsEnabled.indexOf('monitor') && !argv.disableOverseer) {
        const Overseer = require('./lib/overseer/overseer');
        const overseer = new Overseer({
            data: `${argv.home}/monitor.json`,
            result: `${argv.home}/monitor-result.txt`,
            interval: 10000,
            tcpTimeout: 5000,
            webTimeout: 10000,
        });
        overseer.start();
    }

    if (~extensionsEnabled.indexOf('acme') && !argv.disableAcme) {
        const Acme = require('./lib/acme/acme');
        const acme = new Acme({
            data: `${argv.home}/acme.json`,
            interval: 10000,
        });
        acme.start();
    }

    if (argv.discover) {
        require(`${__dirname}/lib/discovery`);
    }
}

if (argv.input) {
    extensions.generate(daemonStart);
} else if (argv.daemon) {
    daemonStart();
}
