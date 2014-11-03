"use strict";

var os = require('os');
var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var logger = require(__dirname + '/../logger');

var jsdiff = require('diff');
var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport();

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

Overseer.prototype.setConfigChanged = function () {
    logger.log('debug', 'monitor: config change detected "' + this.options.data + '"');
    this.configChanged = true;
};

Overseer.prototype.getSettingsString = function () {
    var modeName = this.config.testing ? 'testing' : 'production';
    return modeName + ' mode, interval: ' + this.config.interval + ' ms, tcpTimeout: ' + this.config.tcpTimeout + ' ms, webTimeout: ' + this.config.webTimeout + ' ms';
};

Overseer.prototype.parseJSON = function () {
    try {
        this.config = JSON.parse(fs.readFileSync(this.options.data));
        return true;
    } catch (e) {
        return false;
    }
};

Overseer.prototype.readConfig = function () {
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
        logger.log('verbose', 'monitor: interval not found, using default interval ' + this.options.interval);
        this.config.interval = this.options.interval | 0;
    }

    if (!this.config.tcpTimeout) {
        logger.log('verbose', 'monitor: tcpTimeout not found, using default interval ' + this.options.tcpTimeout);
        this.config.tcpTimeout = this.options.tcpTimeout | 0;
    }
    if (!this.config.webTimeout) {
        logger.log('verbose', 'monitor: webTimeout not found, using default interval ' + this.options.webTimeout);
        this.config.webTimeout = this.options.webTimeout | 0;
    }

    logger.log('info', 'monitor: config loaded, ' + this.getSettingsString());
};

Overseer.prototype.processResults = function (data) {
    if (data.error) {
        logger.log('warn', 'monitor: ' + data.error);
        this.active = false;
        this.watch();
        return;
    }

    logger.log('debug', 'monitor: received successful result from worker.js process');

    var result = data.result;
    var states = [];
    result.forEach(function (service) {
        states.push(service.subject + ', ' + service.status + ', ' + service.notify.join(' '));
    });

    this.state = states.sort().join('\n') + '\n';
    if (this.options.result) {
        fs.writeFileSync(path.resolve(this.options.result), this.state);
    }

    this.generateNotification(this.state, this.prevState);
    this.prevState = this.state;
    this.active = false;

    this.watch();
};

Overseer.prototype.start = function () {
    if (this.active) {
        return;
    }
    if (this.configChanged || !this.config || this.config.disabled) {
        this.watch();
        return;
    }
    if (!fs.existsSync(__dirname + '/worker.js')) {
        logger.log('debug', 'monitor: module file not found worker.js');
        this.watch();
        return;
    }

    this.active = true;

    logger.log('debug', 'monitor: forking worker.js process, ' + this.getSettingsString());

    var child = child_process.fork(__dirname + '/worker.js');
    child.on('message', this.processResults.bind(this));
    child.send(this.config);
};

Overseer.prototype.watch = function () {
    if (this.configChanged) {
        this.readConfig();
    }
    setTimeout(this.start.bind(this), this.config.interval || this.options.interval);
    global.gc && global.gc();
};

Overseer.prototype.mail = function (to, subject, text, html) {
    // var from = process.env['USER'] + '@' + os.hostname();
    // transporter.sendMail({
    //     from: from,
    //     to: to,
    //     subject: subject,
    //     text: text,
    //     html: html
    // });
};

Overseer.prototype.getNotifyFromLine = function (line) {
    var arr = line.split(',');
    return arr[arr.length - 1].trim();
};

Overseer.prototype.parseItem = function (key) {
    var self = this;
    var item = this.config.notify[key];
    switch (item.type) {
    case 'group':
        var list = [];
        item.list.forEach(function (key) {
            list.push(self.parseItem(key));
        });
        return list;
        break;
    case 'email':
        return item.name + ' <' + item.email + '>';
        break;
    case 'sms':
        break;
    default:
        break;
    }
    return '';
};

Overseer.prototype.getAddress = function (key) {
    if (this.config.testing) {
        return this.parseItem('testing');
    }
    return this.parseItem(key);
};

Overseer.prototype.generateNotification = function (current, previous) {
    var self = this;
    var diff = jsdiff.diffLines(previous, current);
    var changesTXT = '';
    var notify = {};
    diff.forEach(function (diffPart) {
        if (!diffPart.added && !diffPart.removed) {
            return;
        }
        var parts = diffPart.value.split('\n');
        parts.forEach(function (part) {
            if (!part) {
                return;
            }
            var changeTXT = (diffPart.added ? '+' : diffPart.removed ? '-' : '') + part;
            changesTXT += changeTXT + '\n';
            logger.log('debug', 'monitor: ' + changeTXT);
            var notifyList = self.getNotifyFromLine(part).split(' ');
            notifyList.forEach(function (notifyKey) {
                notify[notifyKey] = 1;
            });
        });
    });

    var date = (new Date()).toISOString();

    Object.keys(notify).forEach(function (notifyKey) {
        if (!self.config.notify[notifyKey]) {
            return;
        }

        var text = '';
        text += 'Date: ' + date + '\n';
        text += 'Source: ' + os.hostname() + '\n\n\n';

        var html = '';
        html += '<strong>Date:</strong>&nbsp;' + date + '<br>';
        html += '<strong>Source:</strong>&nbsp;' + os.hostname() + '<br><br><br>';

        text += 'Diff:\n';
        html += '<strong>Diff:</strong><br>';
        changesTXT.split('\n').forEach(function (line) {
            if (!line) {
                return;
            }
            var list = self.getNotifyFromLine(line);
            if (~list.indexOf(notifyKey)) {
                text += line + '\n';
                html += '<span style="color:#' + (line[0] === '+' ? (~line.indexOf('FAIL') ? '700' : '070') : '999') + ';">' + line.replace(/^\+/, '<span style="font-family:monospace;">+&nbsp;</span>').replace(/^\-/, '<span style="font-family:monospace;color:#bbb;">-&nbsp;</span>') + '</span><br>';
            }
        });

        text += '\n\nComplete:\n';
        html += '<br><br><strong>Complete:</strong><br>';
        current.split('\n').forEach(function (line) {
            if (!line) {
                return;
            }
            var list = self.getNotifyFromLine(line);
            if (~list.indexOf(notifyKey)) {
                text += line + '\n';
                html += '<span style="color:#' + (~line.indexOf('FAIL') ? '700' : '070') + ';">' + line + '</span><br>';
            }
        });

        var to = self.getAddress(notifyKey);
        var subject = notifyKey + ', monitoring status changed';
        logger.log('debug', 'monitor: message, "' + subject + '" to ' + (Array.isArray(to) ? to.join(', ') : to));
        self.mail(to, subject, text, html);
    });
};

module.exports = Overseer;
