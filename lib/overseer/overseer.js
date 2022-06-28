const os = require('os');
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const debug = require('debug')('beaver:daemons:overseer');
const jsdiff = require('diff');

const argv = require('../argv');
const nodemailer = require('../utils/nodemailer');

class Overseer {
    constructor(options) {
        this.options = options;
        this.state = '';
        this.prevState = '';
        if (this.options.result && fs.existsSync(this.options.result)) {
            this.prevState = fs.readFileSync(this.options.result, 'utf-8');
        }
        this.active = false;
        this.config = false;
        this.configChanged = false;
        this.readConfig();
        fs.watchFile(this.options.data, this.setConfigChanged.bind(this));
    }

    setConfigChanged() {
        debug(`config change detected "${this.options.data}"`);
        this.configChanged = true;
    }

    getSettingsString() {
        const modeName = this.config.testing ? 'testing' : 'production';
        return `${modeName} mode, interval: ${this.config.interval} ms, tcpTimeout: ${this.config.tcpTimeout} ms, webTimeout: ${this.config.webTimeout} ms, maxAttempts: ${this.config.maxAttempts}`;
    }

    parseJSON() {
        try {
            this.config = JSON.parse(fs.readFileSync(this.options.data));
            return true;
        } catch (e) {
            return false;
        }
    }

    readConfig() {
        this.configChanged = false;

        if (!fs.existsSync(this.options.data)) {
            debug('input file is not found, empty loop mode');
            this.config = false;
            return;
        }

        if (!this.parseJSON()) {
            debug('config json parse failed, monitor disabled, empty loop mode');
            this.config = false;
            return;
        }

        if (this.config.disabled) {
            debug('config loaded, monitor disabled, empty loop mode');
            this.config = false;
            return;
        }

        if (!this.config.interval) {
            debug(`interval not found, using default interval ${this.options.interval}`);
            this.config.interval = this.options.interval | 0;
        }

        if (!this.config.tcpTimeout) {
            debug(`tcpTimeout not found, using default interval ${this.options.tcpTimeout}`);
            this.config.tcpTimeout = this.options.tcpTimeout | 0;
        }
        if (!this.config.webTimeout) {
            debug(`webTimeout not found, using default interval ${this.options.webTimeout}`);
            this.config.webTimeout = this.options.webTimeout | 0;
        }

        if (!this.config.maxAttempts) {
            debug(`maxAttempts not found, using default interval ${this.options.maxAttempts}`);
            this.config.maxAttempts = this.options.maxAttempts | 0;
        }

        const tests = [];

        const { tcpTimeout } = this.config;
        if (this.config.tcp) {
            this.config.tcp.forEach((service) => {
                service.type = 'tcp';
                service.maxAttempts = this.config.maxAttempts;
                service.timeout = tcpTimeout;
                tests.push(service);
            });
        }

        const { webTimeout } = this.config;
        if (this.config.web) {
            this.config.web.forEach((service) => {
                service.type = 'web';
                service.maxAttempts = this.config.maxAttempts;
                service.timeout = webTimeout;
                tests.push(service);
            });
        }

        this.config.tests = tests;

        debug(`config loaded, ${this.getSettingsString()}`);
    }

    processResults(data) {
        if (data.error) {
            debug(`error: ${data.error}`);
            return;
        }

        debug('received successful result from worker.js process');

        const { result } = data;
        const states = [];
        result.forEach((service) => {
            const appendReason = (service.type === 'tcp' ? this.config.appendReasonTcp : this.config.appendReasonWeb !== false) || this.config.appendReason;
            states.push(`${service.subject}, ${appendReason && service.reason ? `${service.status}(${service.reason})` : service.status}, ${service.notify.join(' ')}`);
        });

        this.state = `${states.sort().join('\n')}\n`;
        if (this.options.result) {
            fs.writeFileSync(path.resolve(this.options.result), this.state);
        }

        this.generateNotification(this.state, this.prevState);
        this.prevState = this.state;
    }

    workerExitHandler(code, signal) {
        debug(`worker.js exit event ${code} ${signal}`);
        this.active = false;
        this.watch();
    }

    start() {
        if (this.active) {
            return;
        }
        if (this.configChanged || !this.config || this.config.disabled) {
            this.watch();
            return;
        }
        if (!fs.existsSync(`${__dirname}/worker.js`)) {
            debug('module file not found worker.js');
            this.watch();
            return;
        }

        this.active = true;

        debug(`forking worker.js process, ${this.getSettingsString()}`);

        const child = fork(`${__dirname}/worker.js`);
        child.on('message', this.processResults.bind(this));
        child.on('error', this.workerExitHandler.bind(this));
        child.on('exit', this.workerExitHandler.bind(this));
        child.send(this.config);
    }

    watch() {
        if (this.configChanged) {
            this.readConfig();
        }
        clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(this.start.bind(this), this.config.interval || this.options.interval);
        if (global.gc) {
            global.gc();
        }
    }

    parseItem(key) {
        const self = this;
        const item = this.config.notify[key];
        switch (item.type) {
            case 'group':
                const list = [];
                item.list.forEach((innerKey) => {
                    const value = self.parseItem(innerKey);
                    if (Array.isArray(value)) {
                        value.forEach((object) => {
                            list.push(object);
                        });
                    } else {
                        list.push(value);
                    }
                });
                return list;
            case 'email':
                if (item.redirect) {
                    return self.parseItem(item.redirect);
                }
                return `${item.name} <${item.email}>`;
            case 'sms':
                break;
            default:
                break;
        }
        return '';
    }

    getAddress(key) {
        const addresses = this.config.testing ? this.parseItem('testing') : this.parseItem(key);
        if (Array.isArray(addresses)) {
            return addresses.filter((item, i, ar) => ar.indexOf(item) === i);
        }
        return addresses;
    }

    static getNotifyFromLine(line) {
        const arr = line.split(',');
        return arr[arr.length - 1].trim();
    }

    generateNotification(current, previous) {
        const self = this;
        const diff = jsdiff.diffLines(previous, current);
        let changesTXT = '';
        const notify = {};
        diff.forEach((diffPart) => {
            if (!diffPart.added && !diffPart.removed) {
                return;
            }
            const parts = diffPart.value.split('\n');
            parts.forEach((part) => {
                if (!part) {
                    return;
                }
                const changeTXT = (diffPart.added ? '+' : (diffPart.removed ? '-' : '')) + part;
                changesTXT += `${changeTXT}\n`;
                debug(`${changeTXT}`);
                const notifyList = Overseer.getNotifyFromLine(part).split(' ');
                notifyList.forEach((notifyKey) => {
                    notify[notifyKey] = 1;
                });
            });
        });

        const date = (new Date()).toISOString();

        Object.keys(notify).forEach((notifyKey) => {
            if (!self.config.notify[notifyKey]) {
                return;
            }

            let text = '';
            text += `Date: ${date}\n`;
            text += `Source: ${os.hostname()}\n\n\n`;

            let html = '';
            html += `<strong>Date:</strong>&nbsp;${date}<br>`;
            html += `<strong>Source:</strong>&nbsp;${os.hostname()}<br><br><br>`;

            text += 'Diff:\n';
            html += '<strong>Diff:</strong><br>';
            changesTXT.split('\n').forEach((line) => {
                if (!line) {
                    return;
                }
                const list = Overseer.getNotifyFromLine(line);
                if (~list.indexOf(notifyKey)) {
                    text += `${line}\n`;
                    html += `<span style="color:#${line[0] === '+' ? (~line.indexOf('FAIL') ? '700' : '070') : '999'};">${line.replace(/^\+/, '<span style="font-family:monospace;">+&nbsp;</span>').replace(/^\-/, '<span style="font-family:monospace;color:#bbb;">-&nbsp;</span>')}</span><br>`;
                }
            });

            text += '\n\nComplete:\n';
            html += '<br><br><strong>Complete:</strong><br>';
            current.split('\n').forEach((line) => {
                if (!line) {
                    return;
                }
                const list = Overseer.getNotifyFromLine(line);
                if (~list.indexOf(notifyKey)) {
                    text += `${line}\n`;
                    html += `<span style="color:#${~line.indexOf('FAIL') ? '700' : '070'};">${line}</span><br>`;
                }
            });

            const to = self.getAddress(notifyKey);
            const subject = `${notifyKey}, monitoring status changed`;
            debug(`message, "${subject}" to ${Array.isArray(to) ? to.join(', ') : to}`);
            if (argv.disableNotify) {
                debug('notifications are globally disabled');
            } else {
                nodemailer(to, subject, text, html);
            }
        });
    }
}

module.exports = Overseer;
