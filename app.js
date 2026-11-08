import createDebug from 'debug';
const debug = createDebug('beaver');

import versions from './versions.js';
import config from './lib/configuration.js';
import extensions from './lib/extensions/index.js';

import { daemonStarted } from './lib/notificator.js';

const ac = new AbortController();

// function abort() {
//     try {
//         https.stop();
//         ac.abort();
//     } catch (e) {
//         debug(e);
//     }
// }

// process.once('SIGINT', () => {
//     console.log();
//     debug('SIGINT: shutting down...');
//     abort();
// });

// process.once('SIGTERM', () => {
//     console.log('SIGTERM: shutting down...');
//     abort();
// });

export default {
    async main(argv) {
        debug('start');
        debug(`versions: beaver ${await versions.get('beaver')}, yaumnrc ${await versions.get('yaumnrc')}`);
        if (argv.input) {
            try {
                await config.readFile();
                debug('extentions: start');
                const user = process.env.SUDO_USER || process.env.USER;
                try {
                    await extensions.generate({
                        argv,
                        config,
                        debug,
                        user,
                        ac,
                    });
                    debug('extentions: done');
                } catch (e) {
                    debug('extentions: failed');
                    throw e;
                }
            } catch (e) {
                console.error(e);
                if (!argv.daemon) {
                    process.exit(1);
                }
            }
        }
        if (argv.daemon) {
            await this.daemonStart(argv);
            if (argv.dropToUser) {
                debug(`current privileges: uid=${process.getuid()} gid=${process.getgid()}`);
                const user = argv.dropToUser;
                const group = argv.dropToGroup || argv.dropToUser;
                debug(`dropping privileges: user=${user} group=${group}`);
                try {
                    process.setgid(group);
                    process.setuid(user);
                    debug(`current privileges: uid=${process.getuid()} gid=${process.getgid()}`);
                } catch (e) {
                    debug(`failed to drop privileges: ${e}`);
                }
            }
        }
    },
    async daemonStart(argv) {
        debug('daemons: start');
        const promises = [];

        // const s = sleep(60000);
        // s.abort('sd');
        // setTimeout(s.abort.bind(s), 1000);
        // try {
        //     await s;
        // } catch (e) {}

        if (argv.input && !argv.disableDaemonFile) {
            const user = process.env.SUDO_USER || process.env.USER;
            config.watch(async () => {
                return extensions.generate({
                    argv,
                    config,
                    debug,
                    user,
                    ac,
                });
            });
        }

        const extensionsEnabled = argv.e.split(',');

        if (~extensionsEnabled.indexOf('ssl') && !argv.disableDaemonHttps) {
            const { https } = await import('./lib/https/index.js');
            promises.push(https.start());
        }

        if (~extensionsEnabled.indexOf('monitor') && !argv.disableOverseer) {
            const { Overseer } = await import('./lib/overseer/overseer.js');
            promises.push(Overseer.build({
                data: `${argv.home}/monitor.json`,
                result: `${argv.home}/monitor-result.txt`,
                log: argv.overseerLog,
                disableNotify: argv.disableNotify,
                interval: 10000,
                tcpTimeout: 5000,
                webTimeout: 10000,
                maxAttempts: 2,
            }));
        }

        if (~extensionsEnabled.indexOf('acme') && !argv.disableAcme) {
            const { Acme } = await import('./lib/acme/acme.js');
            const acme = new Acme({
                data: `${argv.home}/acme/acme.json`,
                interval: 15 * 60 * 1000,
            });
            setTimeout(acme.start.bind(acme), 30000);
        }

        if (~extensionsEnabled.indexOf('git-static') && !argv.disableGitStatic) {
            const { GitStatic } = await import('./lib/git-static/git-static.js');
            const gitStatic = new GitStatic({
                data: `${argv.home}/git-static/git-static.json`,
                interval: 1 * 60 * 1000,
                ac,
            });
            setTimeout(gitStatic.start.bind(gitStatic), 1 * 60 * 1000);
        }

        if (!argv.disableNotificatorDaemon) {
            const { NotificatorDaemon } = await import('./lib/modules/notificator/daemon.js');
            const notificatorDaemon = new NotificatorDaemon({
                argv,
                config,
                debug,
                ac,
            });
            setTimeout(notificatorDaemon.start.bind(notificatorDaemon), 1 * 1 * 1000);
        }

        await Promise.all(promises);

        daemonStarted();
    },
};
