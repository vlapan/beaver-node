const fs = require('fs');
const { exec } = require('child_process');

const async = require('async');

const argv = require(`${__dirname}/../argv`);
const logger = require(`${__dirname}/../logger`);
const config = require(`${__dirname}/../configuration`);
const extensionsEnabled = argv.e.split(',');

module.exports = {
    list: {
        nat: require(`${__dirname}/nat`),
        www: require(`${__dirname}/www`),
        dns: require(`${__dirname}/dns`),
        dhcp: require(`${__dirname}/dhcp`),
        hosts: require(`${__dirname}/hosts`),
        monitor: require(`${__dirname}/monitor`),
        tinc: require(`${__dirname}/tinc`),
        ssl: require(`${__dirname}/ssl`),
        acme: require(`${__dirname}/acme`),
    },
    generate(callback) {
        const self = this;
        if (self.locked) {
            logger.error('already have some active task!');
            return;
        }
        self.locked = true;

        const extensions = {};

        if (~extensionsEnabled.indexOf('nat')) {
            const nat = this.list.nat[argv.n];
            if (!nat) {
                logger.error(`"${argv.n}" nat not found, available: ${Object.keys(this.list.nat).join(', ')}`);
                process.exit();
            }
            extensions.nat = nat.generate;
        }

        if (~extensionsEnabled.indexOf('www')) {
            const www = this.list.www[argv.w];
            if (!www) {
                logger.error(`"${argv.w}" www not found, available: ${Object.keys(this.list.www).join(', ')}`);
                process.exit();
            }
            extensions.www = www.generate;
        }

        if (~extensionsEnabled.indexOf('dns')) {
            extensions.dns = this.list.dns.generate;
        }

        if (~extensionsEnabled.indexOf('dhcp')) {
            extensions.dhcp = this.list.dhcp.generate;
        }

        if (~extensionsEnabled.indexOf('hosts')) {
            extensions.hosts = this.list.hosts.generate;
        }

        if (~extensionsEnabled.indexOf('monitor')) {
            extensions.monitor = this.list.monitor.generate;
        }

        if (~extensionsEnabled.indexOf('tinc')) {
            extensions.tinc = this.list.tinc.generate;
        }

        if (~extensionsEnabled.indexOf('ssl')) {
            extensions.ssl = this.list.ssl.generate;
        }

        if (~extensionsEnabled.indexOf('acme')) {
            extensions.acme = this.list.acme.generate;
        }

        function cb(err, result) {
            if (typeof callback === 'function') {
                callback(err, result);
            }
        }

        async.series(extensions, (err, result) => {
            if (err) {
                cb(err);
                return;
            }
            logger.log('info', '======================================================================');
            logger.log('info', `CONFIGURATION DONE (${config._outputPath})!`);
            logger.log('info', '======================================================================');
            if (!argv.hook) {
                self.locked = false;
                cb(null, true);
                return;
            }
            logger.log('info', 'Executing hook:', `${argv.hook} ${config._outputPath}`);
            exec(`${argv.hook} ${config._outputPath}`, (error, stdout, stderr) => {
                self.locked = false;
                if (stdout) {
                    logger.log('debug', 'hook stdout:', stdout);
                }
                if (error) {
                    logger.error('hook', error);
                    if (stderr) {
                        logger.error('hook stderr:', stderr);
                    }
                    cb(error + (stderr ? ` // ${stderr}` : ''), true);
                    return;
                }
                if (~extensionsEnabled.indexOf('acme') && fs.existsSync(`${config._outputPath}/acme.json`) && fs.existsSync(argv.home)) {
                    fs.copyFileSync(`${config._outputPath}/acme.json`, `${argv.home}/acme.json`, (error) => {
                        if (error) {
                            logger.error('copy error:', error);
                        }
                    });
                }
                if (~extensionsEnabled.indexOf('monitor') && fs.existsSync(`${config._outputPath}/monitor.json`) && fs.existsSync(argv.home)) {
                    fs.copyFile(`${config._outputPath}/monitor.json`, `${argv.home}/monitor.json`, (error) => {
                        if (error) {
                            logger.error('copy error:', error);
                        }
                        cb(null, true);
                    });
                } else {
                    cb(null, true);
                }
            });
        });
    },
};
