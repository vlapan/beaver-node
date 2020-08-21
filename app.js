const argv = require('./lib/argv');
const logger = require('./lib/logger');

const config = require('./lib/configuration');
const extensions = require('./lib/extensions');

function fileDaemonNote() {
    logger.log('info', `input: daemon mode, watching config file "${argv.input}"!`);
}

function daemonStart(err) {
    if (!argv.daemon || err) {
        process.exit();
    }

    if (argv.input) {
        fileDaemonNote();
        config.watch(() => {
            extensions.generate(fileDaemonNote);
        });
    }

    require('./lib/https');

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
            data: `${argv.home}/acme/acme.json`,
            interval: 15 * 60 * 1000,
        });
        setTimeout(acme.start.bind(acme), 30000);
    }

    if (~extensionsEnabled.indexOf('git-static') && !argv.disableGitStatic) {
        const GitStatic = require('./lib/git-static/git-static');
        const gitStatic = new GitStatic({
            data: `${argv.home}/git-static/git-static.json`,
            interval: 1 * 60 * 1000,
        });
        setTimeout(gitStatic.start.bind(gitStatic), 1 * 60 * 1000);
    }

    if (argv.discover) {
        require('./lib/discovery');
    }
}

if (argv.input) {
    extensions.generate(daemonStart);
} else if (argv.daemon) {
    daemonStart();
}
