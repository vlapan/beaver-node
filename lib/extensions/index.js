const { spawn } = require('child_process');

const async = require('async');

const notificator = require('../notificator');

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
    async generate(o) {
        const debug = o.debug.extend('extentions');

        function bind(obj) {
            return obj.generate.bind(obj, { ...o, debug });
        }

        try {
            if (this.locked) {
                throw new Error('already have some active task!');
            }
            this.locked = true;

            const extensionsEnabled = o.argv.e.split(',');
            const extensions = {};

            if (~extensionsEnabled.indexOf('nat')) {
                const nat = this.list.nat[o.argv.n];
                if (!nat) {
                    const err = `"${o.argv.n}" nat not found, available: ${Object.keys(this.list.nat).join(', ')}`;
                    o.logger.error(err);
                    throw new Error(err);
                }
                extensions.nat = bind(nat);
            }

            if (~extensionsEnabled.indexOf('www')) {
                const www = this.list.www[o.argv.w];
                if (!www) {
                    const err = `"${o.argv.w}" www not found, available: ${Object.keys(this.list.www).join(', ')}`;
                    o.logger.error(err);
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

            if (~extensionsEnabled.indexOf('git-static')) {
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
            this.locked = false;
            await notificator.notify('Configuration done!');
        } catch (error) {
            this.locked = false;
            await notificator.notify(`Configuration failed: ${error.message}`);
            throw error;
        }
    },
};
