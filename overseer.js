var yargs = require('yargs')
    .strict()
    .usage('Watch/check network services.\nUsage: overseer -d ./monitor.json')
    .options('d', {
        alias: 'data',
        string: true,
        describe: 'json data'
    }).options('r', {
        alias: 'result',
        string: true,
        describe: 'results file'
    }).options('i', {
        alias: 'interval',
        string: true,
        default: 10000,
        describe: 'interval between checks, ms'
    }).options('t', {
        alias: 'tcpTimeout',
        string: true,
        default: 5000,
        describe: 'tcp timeout, ms'
    }).options('w', {
        alias: 'webTimeout',
        string: true,
        default: 10000,
        describe: 'web timeout, ms'
    });

var argv = yargs.argv;

var os = require('os');
var fs = require('fs');
var net = require('net');
var path = require('path');
var async = require('async');
var jsdiff = require('diff');

var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport();

//--------------------------------------------


if (!argv.data) {
    console.log(yargs.help());
    process.exit();
}

var tasks, config;

function readConfig() {
    tasks = [];
    config = JSON.parse(fs.readFileSync(argv.data));
    config.tcp.forEach(function (service) {
        tasks.push(checkTcp.bind(null, service));
    });
    config.web.forEach(function (service) {
        tasks.push(checkWeb.bind(null, service));
    });
}
readConfig();

var configChanged = false;
fs.watchFile(path.resolve(argv.data), function (curr, prev) {
    console.log('> config file, modification detected "' + argv.data + '"!');
    configChanged = true;
});

var tcpTimeout = argv.tcpTimeout | 0;
var webTimeout = argv.webTimeout | 0;

var interval = argv.interval | 0;
if (interval < 1000) {
    interval = 1000;
}

function checkTcp(service, callback) {
    var s = new net.Socket();
    s.setNoDelay();

    function setError(reason) {
        service.reason = reason;
        service.status = 'FAIL(' + service.reason + ')';
        s.destroy();
    }

    s.on('close', function (data) {
        callback && callback(null, service);
    });

    s.setTimeout(tcpTimeout, setError.bind(null, 'TIMEOUT'));
    s.on('error', function (error) {
        setError(error.code);
    });

    s.connect(service.port, service.ip, function () {
        service.status = 'OK';
        s.destroy();
    });
}

var request = require('request');

function checkWeb(service, callback) {
    request({
        url: service.url,
        timeout: webTimeout,
        strictSSL: false
    }, function (error, response, body) {
        // console.log(service.url, error, response && response.statusCode);
        if (!error && response.statusCode === service.expectCode) {
            service.status = 'OK';
        } else {
            service.reason = response && response.statusCode ? response.statusCode : error.code;
            service.status = 'FAIL(' + service.reason + ')';
        }
        callback && callback(null, service);
    });
}

var from = process.env['USER'] + '@' + os.hostname()

function mail(to, subject, text, html) {
    transporter.sendMail({
        from: from,
        to: to,
        subject: subject,
        text: text,
        html: html
    });
}

function getNotifyFromLine(line) {
    var arr = line.split(',');
    return arr[arr.length - 1].trim();
}

function parseItem(key) {
    var item = config.notify[key];
    switch (item.type) {
    case 'group':
        var list = [];
        item.list.forEach(function (key) {
            list.push(parseItem(key))
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
}

function getAddress(key) {
    if (config.testing) {
        return parseItem('testing');
    }
    return parseItem(key);
}

function generateNotification(current, previous) {
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
            console.log(changeTXT);
            var notifyList = getNotifyFromLine(part).split(' ');
            notifyList.forEach(function (notifyKey) {
                notify[notifyKey] = 1;
            });
        });
    });

    var date = (new Date()).toISOString();

    Object.keys(notify).forEach(function (notifyKey) {
        if (!config.notify[notifyKey]) {
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
            var list = getNotifyFromLine(line);
            if (~list.indexOf(notifyKey)) {
                text += line + '\n';
                html += '<span style="color:#' + (line[0] === '+' ? (~line.indexOf('FAIL') ? '700' : '070') : '999') + ';">' + line.replace(/^\+/, '<span style="font-family:monospace;">+&nbsp;</span>').replace(/^\-/, '<span style="font-family:monospace;color:#aaa;">-&nbsp;</span>') + '</span><br>';
            }
        });

        text += '\n\nComplete:\n';
        html += '<br><br><strong>Complete:</strong><br>';
        current.split('\n').forEach(function (line) {
            if (!line) {
                return;
            }
            var list = getNotifyFromLine(line);
            if (~list.indexOf(notifyKey)) {
                text += line + '\n';
                html += '<span style="color:#' + (~line.indexOf('FAIL') ? '700' : '070') + ';">' + line + '</span><br>';
            }
        });

        var to = getAddress(notifyKey);
        var subject = notifyKey + ', monitoring status changed';
        console.log(to, subject);
        mail(to, subject, text, html);
    });
}

var prevState = '';
if (argv.result && fs.existsSync(path.resolve(argv.result))) {
    prevState = fs.readFileSync(path.resolve(argv.result), 'UTF-8');
}
var active = false;

function start(callback) {
    if (active) {
        return;
    }
    active = true;
    async.parallel(tasks, function (err, result) {
        var states = [];
        result.forEach(function (service) {
            states.push(service.subject + ', ' + service.status + ', ' + service.notify.join(' '));
        });
        var state = states.sort().join('\n') + '\n';
        if (argv.result) {
            fs.writeFileSync(path.resolve(argv.result), state);
        }

        generateNotification(state, prevState);

        prevState = state;

        active = false;

        if (configChanged) {
            readConfig();
            configChanged = false;
        }

        callback && callback();
    });
}

start(function watch() {
    setTimeout(start.bind(null, watch), interval);
});
