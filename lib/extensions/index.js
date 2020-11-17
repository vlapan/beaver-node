const fs = require('fs');
const { spawn } = require('child_process');

const async = require('async');

const diff = require('../utils/diff');
const notificator = require('../notificator');
const { file } = require('../utils/tpl');

module.exports = {
    list: {
        nat: require('./nat'),
        www: require('./www'),
        dns: require('./dns'),
        dhcp: require('./dhcp'),
        hosts: require('./hosts'),
        monitor: require('./monitor'),
        tinc: require('./tinc'),
        ssl: require('./ssl'),
        acme: require('./acme'),
        gitStatic: require('./git-static'),
    },
    // TODO: save/load state to file
    locked: false,
    lockedErrorMessage: 'already have some active task!',
    isLocked() {
        return this.locked;
    },
    lock() {
        this.locked = true;
    },
    unlock() {
        this.locked = false;
    },
    async generate(o) {
        const debug = o.debug.extend('extentions');

        function bind(obj) {
            return obj.generate.bind(obj, { ...o, debug });
        }

        if (this.isLocked()) {
            const error = new Error(this.lockedErrorMessage);
            await notificator.notify(`🛑 Configuration failed: ${error.message}`);
            throw error;
        }

        this.lock();

        try {
            const extensionsEnabled = o.argv.e.split(',');
            const extensions = {};

            if (~extensionsEnabled.indexOf('nat')) {
                const nat = this.list.nat[o.argv.n];
                if (!nat) {
                    const err = `"${o.argv.n}" nat not found, available: ${Object.keys(this.list.nat).join(', ')}`;
                    throw new Error(err);
                }
                extensions.nat = bind(nat);
            }

            if (~extensionsEnabled.indexOf('www')) {
                const www = this.list.www[o.argv.w];
                if (!www) {
                    const err = `"${o.argv.w}" www not found, available: ${Object.keys(this.list.www).join(', ')}`;
                    throw new Error(err);
                }
                extensions.www = bind(www);
            }

            if (~extensionsEnabled.indexOf('dns')) {
                extensions.dns = bind(this.list.dns);
            }

            if (~extensionsEnabled.indexOf('dhcp')) {
                extensions.dhcp = bind(this.list.dhcp);
            }

            if (~extensionsEnabled.indexOf('hosts')) {
                extensions.hosts = bind(this.list.hosts);
            }

            if (~extensionsEnabled.indexOf('monitor')) {
                extensions.monitor = bind(this.list.monitor);
            }

            if (~extensionsEnabled.indexOf('tinc')) {
                extensions.tinc = bind(this.list.tinc);
            }

            if (~extensionsEnabled.indexOf('ssl')) {
                extensions.ssl = bind(this.list.ssl);
            }

            if (~extensionsEnabled.indexOf('acme')) {
                extensions.acme = bind(this.list.acme);
            }

            if (~extensionsEnabled.indexOf('git-static') && !o.argv.disableGitStatic) {
                extensions.gitStatic = bind(this.list.gitStatic);
            }

            debug(`parallel run: start (${o.config._outputPath})`);
            await async.parallel(extensions);
            debug(`parallel run: finish (${o.config._outputPath})`);

            if (o.argv.hook) {
                debug(`executing hook: ${o.argv.hook} ${o.config._outputPath}`);
                try {
                    await new Promise(resolve => {
                        const p = spawn(o.argv.hook, [o.config._outputPath], {
                            stdio: [
                                null,
                                process.stdout,
                                process.stderr
                            ],
                        });
                        p.on('error', (error) => {
                            resolve(Promise.reject(new Error(error)));
                        });
                        p.on('exit', (code) => {
                            resolve(code > 0 && Promise.reject(new Error(`hook failed with code: ${code}`)));
                        });
                    });
                    debug(`executing hook: done`);
                } catch (error) {
                    debug(`executing hook: failed`);
                    throw error;
                }
            }

            const a = JSON.parse(await o.config.loadClean());
            if (a) {
                const b = JSON.parse(`${o.config.parser.toSourceNonSecure()}`);
                const changes = diff(a, b);

                await notificator.notify(file`
                    ${o.user}: ✅ Configuration done!
                    ${changes.length ? `Diff:` : 'No changes'}${changes.length ? `
                    \`\`\`${changes.join('\n                    ')}\`\`\`` : ''}`);
            } else {
                await notificator.notify(file`
                    ${o.user}: ✅ Configuration done!
                    Fresh!`);
            }
            await Promise.all([
                fs.promises.writeFile(`${o.argv.home}/last.json`, JSON.stringify({
                    date: (new Date()).toISOString(),
                    version: await notificator.getVersion(),
                }, null, 4)),
                o.config.saveClean(),
            ]);
            this.unlock();
        } catch (error) {
            await notificator.notify(`${o.user}: 🛑 Configuration failed: ${error.message}`);
            this.unlock();
            throw error;
        }
    },
};
