const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');

const debug = require('debug')('beaver:daemons:overseer');
const jsdiff = require('diff');

const { pathAsJSON } = require('../utils/index.js');
const { checkFileExists } = require('../utils/fs');
const nodemailer = require('../utils/nodemailer');

class Overseer {
    constructor(options) {
        this.options = options;
        this.state = '';
        this.prevState = '';
        this.active = false;
        this.config = false;
        this.configChanged = false;
    }

    static async build(options) {
        const overseer = new Overseer(options);
        if (options.result && await checkFileExists(options.result)) {
            overseer.prevState = await fs.promises.readFile(options.result, 'utf8');
        }
        await overseer.readConfig();
        fs.watchFile(options.data, overseer.setConfigChanged.bind(overseer));
        await overseer.start();
        return overseer;
    }

    setConfigChanged() {
        debug(`config change detected "${this.options.data}"`);
        this.configChanged = true;
    }

    getSettingsString() {
        const modeName = this.config.testing ? 'testing' : 'production';
        return `${modeName} mode, interval: ${this.config.interval} ms, tcpTimeout: ${this.config.tcpTimeout} ms, webTimeout: ${this.config.webTimeout} ms, maxAttempts: ${this.config.maxAttempts}`;
    }

    async readConfig() {
        this.configChanged = false;

        if (!await checkFileExists(this.options.data)) {
            debug('input file is not found, empty loop mode');
            this.config = false;
            return;
        }

        try {
            this.config = await pathAsJSON(this.options.data);
        } catch {
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

    async processResults(data) {
        if (data.error) {
            debug(`error: ${data.error}`);
            return;
        }

        debug('received successful result from worker.js process');

        const { result } = data;
        const states = [];
        result.forEach((service) => {
            const appendReason = Boolean((service.type === 'tcp' ? this.config.appendReasonTcp : this.config.appendReasonWeb) ?? this.config.appendReason ?? true);
            states.push(`${service.subject}, ${appendReason && service.reason ? `${service.status}(${service.reason})` : service.status}, ${service.notify.join(' ')}`);
        });

        this.state = `${states.sort().join('\n')}\n`;

        await this.generateNotification(this.state, this.prevState);

        if (this.options.result) {
            await fs.promises.writeFile(path.resolve(this.options.result), this.state);
        }

        this.prevState = this.state;
    }

    workerExitHandler(code, signal) {
        debug(`worker.js exit event ${code} ${signal}`);
        this.watch();
    }

    async start() {
        if (this.active) {
            return;
        }
        this.active = true;

        if (this.configChanged || !this.config || this.config.disabled) {
            this.watch();
            return;
        }

        if (!await checkFileExists(`${__dirname}/worker.js`)) {
            debug('module file not found worker.js');
            this.watch();
            return;
        }

        debug(`forking worker.js process, ${this.getSettingsString()}`);

        const child = fork(`${__dirname}/worker.js`);
        child.on('message', this.processResults.bind(this));
        child.on('error', this.workerExitHandler.bind(this));
        child.on('exit', this.workerExitHandler.bind(this));
        child.send(this.config);
    }

    async watch() {
        this.active = false;
        if (this.configChanged) {
            await this.readConfig();
        }
        clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(this.start.bind(this), this.config.interval || this.options.interval);
        if (global.gc) {
            global.gc();
        }
    }

    parseItem(key) {
        const item = this.config.notify[key];
        if (!item) {
            debug(`config.notify has no key "${key}"`);
            return '';
        }
        switch (item.type) {
            case 'group':
                const list = [];
                item.list.forEach((innerKey) => {
                    const value = this.parseItem(innerKey);
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
                    return this.parseItem(item.redirect);
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
        return arr.at(-1).trim();
    }

    static makeOperationMonospaced(line) {
        return line.replace(/^([+=~-])/, '<span style="font-family:monospace;">$1&nbsp;</span>');
    }

    static colorLineByStatus(line) {
        return line[0] === '+' ? (line.includes('FAIL') ? '700' : '070') : '999';
    }

    async generateNotification(current, previous) {
        let diffTrigger = [];
        const notify = {};

        const diffNoReason = jsdiff.diffLines(previous.replace(/\(.*\),/g, ','), current.replace(/\(.*\),/g, ','));
        diffNoReason.forEach((diffPart) => {
            if (!diffPart.added && !diffPart.removed) {
                return;
            }
            const parts = diffPart.value.split('\n');
            parts.forEach((part) => {
                if (!part) {
                    return;
                }
                const changeTXT = (diffPart.added ? '+' : (diffPart.removed ? '-' : '')) + part;
                diffTrigger.push(changeTXT);
                debug(`${changeTXT}`);
                const notifyList = Overseer.getNotifyFromLine(part).split(' ');
                notifyList.forEach((notifyKey) => {
                    notify[notifyKey] = 1;
                });
            });
        });

        if (Object.keys(notify).length === 0) {
            return;
        }

        const diff = jsdiff.diffLines(previous, current);
        let diffCurrent = [];
        let diffPreviously = [];
        diff.forEach((diffPart) => {
            const parts = diffPart.value.split('\n');
            parts.forEach((part) => {
                if (!part) {
                    return;
                }
                if (!diffPart.removed) {
                    diffCurrent.push(`${diffPart.added ? '+' : '~'}${part}`);
                }
                if (diffPart.removed) {
                    diffPreviously.push(`-${part}`);
                }
            });
        });

        const date = (new Date()).toISOString();

        for (const notifyKey of Object.keys(notify)) {
            if (!this.config.notify[notifyKey]) {
                return;
            }

            const to = this.getAddress(notifyKey);
            if (!to) {
                return;
            }

            const subject = `${notifyKey}, monitoring status changed`;

            let text = '';
            text += `Date: ${date}\n`;
            text += `Source: ${os.hostname()}\n\n\n`;

            let html = '';
            html += `<strong>Date:</strong>&nbsp;${date}<br>`;
            html += `<strong>Source:</strong>&nbsp;${os.hostname()}<br><br><br>`;

            text += 'DIFF:\n';
            html += '<strong>DIFF:</strong><br>';
            diffTrigger.forEach((line) => {
                if (!line) {
                    return;
                }
                const list = Overseer.getNotifyFromLine(line);
                if (list.includes(notifyKey)) {
                    text += `${line}\n`;
                    html += `<span style="color:#${Overseer.colorLineByStatus(line)};">${Overseer.makeOperationMonospaced(line)}</span><br>`;
                }
            });

            text += '\n\nCURRENT:\n';
            html += '<br><br><strong>CURRENT:</strong><br>';
            diffCurrent.forEach((line) => {
                if (!line) {
                    return;
                }
                const list = Overseer.getNotifyFromLine(line);
                if (list.includes(notifyKey)) {
                    text += `${line}\n`;
                    html += `<span style="color:#${Overseer.colorLineByStatus(line)};">${Overseer.makeOperationMonospaced(line)}</span><br>`;
                }
            });

            if (diffPreviously.length > 0) {
                const diffPreviouslyText = [];
                const diffPreviouslyHtml = [];
                diffPreviously.forEach((line) => {
                    if (!line) {
                        return;
                    }
                    const list = Overseer.getNotifyFromLine(line);
                    if (list.includes(notifyKey)) {
                        diffPreviouslyText.push(line);
                        diffPreviouslyHtml.push(`<span style="color:#${Overseer.colorLineByStatus(line)};">${Overseer.makeOperationMonospaced(line)}</span>`);
                    }
                });
                if (diffPreviouslyText.length > 0) {
                    text += `\n\nPREVIOUSLY:\n${diffPreviouslyText.join('\n')}`;
                    html += `<br><br><strong>PREVIOUSLY:</strong><br>${diffPreviouslyHtml.join('\n')}`;
                }
            }

            debug(`message, "${subject}" to ${Array.isArray(to) ? to.join(', ') : to}`);
            if (this.options.disableNotify) {
                debug('notifications are globally disabled');
            } else {
                await nodemailer(to, subject, text, html);
            }
        }
    }
}

module.exports = Overseer;
