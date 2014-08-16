var yargs = require('yargs')
    .strict()
    .usage('Watch/check network services.\nUsage: overseer -h 10.1.1.1 -p 80')
    .options('h', {
        alias: 'hosts',
        demand: true,
        string: true,
        describe: 'target hosts, comma-separated'
    }).options('p', {
        alias: 'ports',
        demand: true,
        string: true,
        describe: 'ports to check, comma-separated'
    }).options('t', {
        alias: 'timeout',
        string: true,
        default: 2000,
        describe: 'timeout, ms'
    }).options('w', {
        alias: 'watch',
        boolean: true,
        describe: 'watch ports'
    }).options('i', {
        alias: 'interval',
        string: true,
        default: 10000,
        describe: 'interval between checks, ms'
    }).options('m', {
        alias: 'mail',
        string: true,
        describe: 'mail addresses, comma-separated'
    });

var argv = yargs.argv;

var os = require('os');
var fs = require('fs');
var net = require('net');
var path = require('path');
var async = require('async');
var moment = require('moment');

var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport();

//--------------------------------------------

var hosts = argv.hosts.split(',');

var ports = argv.ports.split(',');
ports.map(function (port) {
    return port | 0;
}).filter(function (port) {
    return port > 0 && port <= 65535;
});

var timeout = argv.timeout | 0;

var interval = argv.interval | 0;
if (interval < 1000) {
    interval = 1000;
}

var active = false;

var closedSince = {};

function log(result) {
    var now = new Date().toISOString();
    var message = result.type;
    if (result.reason) {
        message += ' (' + result.reason + ')';
    }
    if (argv.w) {
        message += '\t';
        if (result.type === 'alive') {
            message += '\t\twas dead since';
        } else if (result.type === 'closed') {
            message += 'since\t'
        }
        message += '\t' + result.since.toISOString() + '\t' + moment(result.since).fromNow();
    }
    console.log(now + '\t' + result.host + '\t' + result.port + '\t' + message);
}

function checkService(host, port, callback) {
    var result;
    var key = host + ':' + port;

    var s = new net.Socket();
    s.setNoDelay();

    function setError(reason) {
        if (!closedSince[key]) {
            closedSince[key] = new Date();
        }
        result = {
            type: 'closed',
            date: new Date(),
            host: host,
            port: port,
            since: closedSince[key],
            reason: reason
        };
        s.destroy();
        log(result);
    }

    s.on('close', function (data) {
        callback && callback(null, result);
    });

    s.setTimeout(timeout, setError.bind(null, 'timeout'));
    s.on('error', function (error) {
        setError(error.code);
    });

    s.connect(port, host, function () {
        if (argv.w && closedSince[key]) {
            var since = closedSince[key];
            result = {
                type: 'alive',
                date: new Date(),
                host: host,
                port: port,
                since: since
            };
            log(result);
            delete closedSince[key];
        } else if (!argv.w) {
            result = {
                type: 'opened',
                date: new Date(),
                host: host,
                port: port
            };
            log(result);
        }
        s.destroy();
    });
}

var previousResult;

function mail(subject, html) {
    transporter.sendMail({
        from: process.env['USER'] + '@' + os.hostname(),
        to: argv.mail.split(','),
        subject: subject,
        html: html
    });
}

var jade = require('jade');
var messageTemplate = jade.compile(fs.readFileSync(path.normalize(__dirname + '/templates/notification.jade')));

function generateNotification(result) {
    // console.log(result);
    var changed = result;

    if (previousResult) {
        var previousGrouped = {};
        previousResult.forEach(function(item) {
            var key = item.host + '_' + item.port;
            previousGrouped[key] = item;
        });
        changed = changed.filter(function(item) {
            var key = item.host + '_' + item.port;
            return !previousGrouped[key] || (previousGrouped[key] && previousGrouped[key].type !== item.type);
        });
    }
    // console.log(changed);

    if (!changed.length) {
        return;
    }

    var aliveCount = changed.map(function(item) {
        return item.type === 'alive' | 0
    }).reduce(function(a, b) {
        return a + b;
    });

    var closedCount = changed.length - aliveCount;

    var changedGrouped = {};
    changed.forEach(function(item) {
        if (!changedGrouped[item.host]) {
            changedGrouped[item.host] = {};
        }
        changedGrouped[item.host][item.port] = item;
        item.sinceText = moment(item.since).fromNow();
    });

    var subject = 'services status' + (closedCount ? ', ' + closedCount + ' closed' : '') + (aliveCount ? ', ' + aliveCount + ' alive' : '');
    var message = messageTemplate({
        aliveCount: aliveCount,
        closedCount: closedCount,
        changed: changedGrouped
    });
    // console.log(message);

    if (argv.mail) {
        mail(subject, message);
    }
}

var tasks = [];
hosts.forEach(function (host) {
    ports.forEach(function (port) {
        tasks.push(checkService.bind(null, host, port));
    });
});

function start(callback) {
    if (active) {
        return;
    }
    active = true;
    async.parallel(tasks, function (err, result) {
        result = result.filter(function (item) {
            return item;
        });
        generateNotification(result);
        previousResult = result;
        active = false;
        callback && callback();
    });
}

start(function watch() {
    if (argv.w) {
        setTimeout(start.bind(null, watch), interval);
    }
});
