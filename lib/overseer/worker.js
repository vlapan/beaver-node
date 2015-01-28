"use strict";

var os = require('os');
var net = require('net');
var async = require('async');

process.on('message', parse);

process.on('disconnect', function() {
  console.log('worker.js: shutting down');
  process.exit();
});

function parse(config) {
    if (typeof config !== 'object') {
        process.send({
            error: 'no config'
        });
        process.exit();
    }

    if (!config.tests.length) {
        process.send({
            error: 'no tests'
        });
        process.exit();
    }

    var tasks = [];
    var current = 0;
    var step = ((config.interval - Math.max(config.tcpTimeout, config.webTimeout)) / config.tests.length) | 0;

    config.tests.forEach(function (service) {
        var check = service.type === 'tcp' ? checkTcp : checkWeb;
        tasks.push(deferred.bind(null, check.bind(null, service), current));
        current += step;
    });

    async.parallel(tasks, function processResults(err, result) {
        if (!process.connected) {
            process.exit();
        }
        if (err) {
            process.send({
                error: err
            });
        } else {
            process.send({
                result: result
            });
        }
        process.exit();
    });
}

function deferred(test, timeout, callback) {
    setTimeout(test.bind(null, callback), timeout);
}

function checkTcp(service, callback) {
    // console.log(Date.now(), service.subject, service.reason);
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

    s.setTimeout(service.timeout, setError.bind(null, 'TIMEOUT'));
    s.on('error', function (error) {
        setError(error.code);
    });

    s.connect(service.port, service.ip, function () {
        service.status = 'OK';
        s.destroy();
    });
}

var url = require('url');
var http = require('http');
var https = require('https');

function requestWeb(protocol, options, callback) {
    var manager = protocol === 'http' ? http : https;
    var request = manager.request(options, callback).on('error', function (err) {
        callback(err.code);
    }).on('socket', function (socket) {
        socket.setTimeout(options.timeout);
        socket.on('timeout', function () {
            request.abort();
        });
    });
    request.end();
}

function requestCallback(callback, response) {
    var service = this;
    if (typeof response === 'string') {
        service.status = 'FAIL(' + response + ')';
    } else {
        if (response.statusCode === service.expectCode) {
            service.status = 'OK';
        } else {
            service.status = 'FAIL(' + response.statusCode + ')';
        }
        response.on('data', function () {});
        response.on('end', function () {});
        response.socket.end();
        response.req.abort();
    }
    if (service.tries === 1 && service.status !== 'OK') {
        service.tries++;
        checkWeb(service, callback);
        return;
    }
    if (service.done === true) {
        console.error('callback was already called', service);
        return;
    }
    service.done = true;
    // console.log(callback, service.url, typeof response === 'string' ? response : response.statusCode);
    callback && callback(null, service);
}

function checkWeb(service, callback) {
    // console.log(Date.now(), service.subject, service.reason);
    var urlParsed = url.parse(service.url);
    var options = {
        agent: false,
        timeout: service.timeout,
        headers: {
            'Connection': 'close',
            'User-Agent': 'monitor @ ' + os.hostname()
        },
        rejectUnauthorized: false
    };
    if (service.ip) {
        options.hostname = service.ip;
        options.headers['Host'] = urlParsed.hostname;
    } else {
        var ip = service.subject.match(/ip=([0-9.]+$)/);
        if (ip) {
            ip = ip[1];
            options.hostname = ip;
            options.headers['Host'] = urlParsed.hostname;
        } else {
            options.hostname = urlParsed.hostname;
        }
    }

    if (service.port) {
        options.port = service.port;
    } else if (urlParsed.port) {
        options.port = urlParsed.port;
    }
    options.path = urlParsed.path;

    if (!service.tries) {
        service.tries = 1;
    }
    requestWeb(urlParsed.protocol.replace(':', ''), options, requestCallback.bind(service, callback));
}
