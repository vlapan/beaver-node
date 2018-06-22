const os = require('os');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const Hoek = require('hoek');

const logger = require(`${__dirname}/../logger`);

const jsdiff = require('diff');
const nodemailer = require('nodemailer');
const smtpPool = require('nodemailer-smtp-pool');

const transporter = nodemailer.createTransport(smtpPool({}));

function Overseer(options) {
    this.options = options;
    this.state = '';
    this.prevState = '';
    if (this.options.result && fs.existsSync(this.options.result)) {
        this.prevState = fs.readFileSync(this.options.result, 'UTF-8');
    }
    this.active = false;
    this.config = false;
    this.configChanged = false;
    this.readConfig();
    fs.watchFile(this.options.data, this.setConfigChanged.bind(this));
}

Overseer.prototype.setConfigChanged = function setConfigChanged() {
    logger.log('debug', `monitor: config change detected "${this.options.data}"`);
    this.configChanged = true;
};

Overseer.prototype.getSettingsString = function getSettingsString() {
    const modeName = this.config.testing ? 'testing' : 'production';
    return `${modeName} mode, interval: ${this.config.interval} ms, tcpTimeout: ${this.config.tcpTimeout} ms, webTimeout: ${this.config.webTimeout} ms`;
};

Overseer.prototype.parseJSON = function parseJSON() {
    try {
        this.config = JSON.parse(fs.readFileSync(this.options.data));
        return true;
    } catch (e) {
        return false;
    }
};

Overseer.prototype.readConfig = function readConfig() {
    this.configChanged = false;

    if (!fs.existsSync(this.options.data)) {
        logger.log('debug', 'monitor: input file is not found, empty loop mode');
        this.config = false;
        return;
    }

    if (!this.parseJSON()) {
        logger.log('info', 'monitor: config json parse failed, monitor disabled, empty loop mode');
        this.config = false;
        return;
    }

    if (this.config.disabled) {
        logger.log('info', 'monitor: config loaded, monitor disabled, empty loop mode');
        this.config = false;
        return;
    }

    if (!this.config.interval) {
        logger.log('verbose', `monitor: interval not found, using default interval ${this.options.interval}`);
        this.config.interval = this.options.interval | 0;
    }

    if (!this.config.tcpTimeout) {
        logger.log('verbose', `monitor: tcpTimeout not found, using default interval ${this.options.tcpTimeout}`);
        this.config.tcpTimeout = this.options.tcpTimeout | 0;
    }
    if (!this.config.webTimeout) {
        logger.log('verbose', `monitor: webTimeout not found, using default interval ${this.options.webTimeout}`);
        this.config.webTimeout = this.options.webTimeout | 0;
    }

    const tests = [];

    const tcpTimeout = this.config.tcpTimeout;
    if (this.config.tcp) {
        this.config.tcp.forEach((service) => {
            service.type = 'tcp';
            service.timeout = tcpTimeout;
            tests.push(service);
        });
    }

    const webTimeout = this.config.webTimeout;
    if (this.config.web) {
        this.config.web.forEach((service) => {
            service.type = 'web';
            service.timeout = webTimeout;
            tests.push(service);
        });
    }

    this.config.tests = tests;

    logger.log('info', `monitor: config loaded, ${this.getSettingsString()}`);
};

Overseer.prototype.processResults = function processResults(data) {
    if (data.error) {
        logger.log('warn', `monitor: ${data.error}`);
        return;
    }

    logger.log('debug', 'monitor: received successful result from worker.js process');

    const [result] = data;
    const states = [];
    result.forEach((service) => {
        states.push(`${service.subject}, ${service.status}, ${service.notify.join(' ')}`);
    });

    this.state = `${states.sort().join('\n')}\n`;
    if (this.options.result) {
        fs.writeFileSync(path.resolve(this.options.result), this.state);
    }

    this.generateNotification(this.state, this.prevState);
    this.prevState = this.state;
};

Overseer.prototype.workerExitHandler = function workerExitHandler(code, signal) {
    logger.log('debug', 'monitor: worker.js exit event', code, signal);
    this.active = false;
    this.watch();
};

Overseer.prototype.start = function start() {
    if (this.active) {
        return;
    }
    if (this.configChanged || !this.config || this.config.disabled) {
        this.watch();
        return;
    }
    if (!fs.existsSync(`${__dirname}/worker.js`)) {
        logger.log('debug', 'monitor: module file not found worker.js');
        this.watch();
        return;
    }

    this.active = true;

    logger.log('debug', `monitor: forking worker.js process, ${this.getSettingsString()}`);

    const child = child_process.fork(`${__dirname}/worker.js`);
    child.on('message', this.processResults.bind(this));
    child.on('error', this.workerExitHandler.bind(this));
    child.on('exit', this.workerExitHandler.bind(this));
    child.send(this.config);
};

Overseer.prototype.watch = function watch() {
    if (this.configChanged) {
        this.readConfig();
    }
    clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(this.start.bind(this), this.config.interval || this.options.interval);
    if (global.gc) {
        global.gc();
    }
};

Overseer.prototype.mail = function mail(to, subject, text, html) {
    const from = `${process.env.USER || 'root'}@${os.hostname()}`;
    transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
    }, (error, response) => {
        if (error) {
            logger.log('warn', error);
            return;
        }

        // response.statusHandler only applies to 'direct' transport
        if (!response.statusHandler) {
            return;
        }

        response.statusHandler.once('failed', (data) => {
            logger.log('warn', `Permanently failed delivering message to ${data.domain} with the following response: ${data.response}`);
        });

        response.statusHandler.once('requeue', (data) => {
            logger.log('warn', `Temporarily failed delivering message to ${data.domain}`);
        });

        response.statusHandler.once('sent', (data) => {
            logger.log('info', `Message was accepted by ${data.domain}`);
        });
    });
};

Overseer.prototype.getNotifyFromLine = function getNotifyFromLine(line) {
    const arr = line.split(',');
    return arr[arr.length - 1].trim();
};

Overseer.prototype.parseItem = function parseItem(key) {
    const self = this;
    const item = this.config.notify[key];
    switch (item.type) {
    case 'group':
        const list = [];
        item.list.forEach((key) => {
            const value = self.parseItem(key);
            if (Array.isArray(value)) {
                value.forEach((object) => {
                    list.push(object);
                });
            } else {
                list.push(value);
            }
        });
        return list;
        break;
    case 'email':
        if (item.redirect) {
            return self.parseItem(item.redirect);
        }
        return `${item.name} <${item.email}>`;
        break;
    case 'sms':
        break;
    default:
        break;
    }
    return '';
};

Overseer.prototype.getAddress = function getAddress(key) {
    const addresses = this.config.testing ? this.parseItem('testing') : this.parseItem(key);
    if (Array.isArray(addresses)) {
        return Hoek.unique(addresses);
    }
    return addresses;
};

Overseer.prototype.generateNotification = function generateNotification(current, previous) {
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
            logger.log('debug', `monitor: ${changeTXT}`);
            const notifyList = self.getNotifyFromLine(part).split(' ');
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
            const list = self.getNotifyFromLine(line);
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
            const list = self.getNotifyFromLine(line);
            if (~list.indexOf(notifyKey)) {
                text += `${line}\n`;
                html += `<span style="color:#${~line.indexOf('FAIL') ? '700' : '070'};">${line}</span><br>`;
            }
        });

        const to = self.getAddress(notifyKey);
        const subject = `${notifyKey}, monitoring status changed`;
        logger.log('debug', `monitor: message, "${subject}" to ${Array.isArray(to) ? to.join(', ') : to}`);
        self.mail(to, subject, text, html);
    });
};

module.exports = Overseer;
