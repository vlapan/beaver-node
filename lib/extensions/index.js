const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

const modules = require('../modules');
const versions = require('../../versions');
const notificator = require('../notificator');
const { checkFileExists, checkDirectoryExists, findFile, modeRX } = require('../utils/fs');

const M = {
    list: {
        nat: require('./nat'),
        www: require('./www'),
        dns: require('./dns'),
        dhcp: require('./dhcp'),
        monitor: require('./monitor'),
        tinc: require('./tinc'),
        ssl: require('./ssl'),
        acme: require('./acme'),
        gitStatic: require('./git-static'),
    },
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
    spawn(options) {
        return new Promise((resolve, reject) => {
            const p = spawn(options.command, options.args ? [].concat(options.args) : [], {
                env: options.env,
                signal: options.signal,
                stdio: [
                    null,
                    'pipe',
                    'pipe',
                ],
            });

            createInterface({
                input: p.stdout,
                terminal: false,
            }).on('line', options.debug.extend('stdout'));

            createInterface({
                input: p.stderr,
                terminal: false,
            }).on('line', options.debug.extend('stderr'));

            p.on('error', (error) => {
                reject(new Error(error));
            });

            p.on('exit', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`command failed with code: ${code}`));
                }
            });
        });
    },
    async generate(o) {
        const debug = o.debug.extend('extentions');

        function bind(obj) {
            return obj.generate.bind(obj, { ...o, debug });
        }

        if (this.isLocked()) {
            const error = new Error(this.lockedErrorMessage);
            await notificator.notify(`${o.user}: 🟥 Configuration failed: ${error.message}`, 'generator');
            throw error;
        }

        this.lock();

        try {
            const extensionsEnabled = o.argv.e.split(',');
            o.modules = modules.init(o, extensionsEnabled);

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

            if (~extensionsEnabled.indexOf('git-static')) {
                extensions.gitStatic = bind(this.list.gitStatic);
            }

            debug(`parallel run: start (${o.config._outputPath})`);
            await Promise.all([
                Promise.all(Object.values(extensions).map((v) => v())),
                o.modules.transform(),
            ]);
            await o.modules.postTransform();
            debug(`parallel run: finish (${o.config._outputPath})`);


            const hookProcess = async (hook, debug) => {
                debug(`executing: ${hook} ${o.config._outputPath}`);
                try {
                    await M.spawn({
                        command: hook,
                        args: o.config._outputPath,
                        signal: o.ac.signal,
                        env: {
                            BEAVER_VERSION: await versions.get('beaver'),
                            BEAVER_OUTPUT_PATH: o.config._outputPath,
                        },
                        debug,
                    });
                    debug('executing: done');
                } catch (e) {
                    debug('executing: failed');
                    throw e;
                }
            };
            const hookDefaultPath = path.resolve(`${o.argv.home}/hook`);
            if (o.argv.hook && await modeRX(o.argv.hook)) {
                debug('hook type: provided');
                await hookProcess(o.argv.hook, debug.extend('hook'));
            } else if (await modeRX(hookDefaultPath)) {
                debug('hook type: default');
                await hookProcess(hookDefaultPath, debug.extend('hook'));
            } else {
                debug('hook type: directory');
                const hookDirPath = path.resolve(`${o.argv.home}/hook.d`);
                if (await checkDirectoryExists(hookDirPath)) {
                    const hooksPath = await findFile(hookDirPath, modeRX, false);
                    for (const hookPath of hooksPath.sort()) {
                        await hookProcess(hookPath, debug.extend(`hook:${hookPath.split('/').at(-1)}`));
                    }
                }
            }


            await o.modules.postHook();

            if (o.argv.tar) {
                const tar = require('tar');
                tar.create({
                    gzip: true,
                    cwd: o.config._outputPath,
                }, ['.']).pipe(process.stdout);
            }

            const notifyBody = [
                o.modules.cleanConfig.toMessage(),
                o.modules.importantMessages.toMessage(),
            ];
            await Promise.all([
                notificator.notify(`${o.user}: 🟩 Configuration done!\n${notifyBody.filter((v) => v !== '').join('\n')}`, 'generator'),
                fs.promises.writeFile(`${o.argv.home}/last.json`, JSON.stringify({
                    date: (new Date()).toISOString(),
                    version: await versions.get('beaver'),
                }, null, 4)),
            ]);

            debug('done');
        } catch (e) {
            await notificator.notify(`${o.user}: 🟥 Configuration failed: ${e.message}`, 'generator');
            throw e;
        } finally {
            this.unlock();
        }
    },
};

module.exports = M;
