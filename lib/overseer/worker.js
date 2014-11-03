"use strict";

var net = require('net');
var async = require('async');

process.on('message', function (config) {
    if (typeof config !== 'object') {
        process.send({
            error: 'no config'
        });
        process.exit();
    }

    var tasks = [];
    config.tcp && config.tcp.forEach(function (service) {
        service.timeout = config.tcpTimeout;
        tasks.push(checkTcp.bind(null, service));
    });
    config.web && config.web.forEach(function (service) {
        service.timeout = config.webTimeout;
        tasks.push(checkWeb.bind(null, service));
    });

    if (!tasks.length) {
        process.send({
            error: 'no tasks'
        });
        process.exit();
    }

    async.parallel(tasks, function processResults(err, result) {
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
});

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
var request = require('request');

function checkWeb(service, callback) {
    var headers;
    var urlString;
    var ip = service.subject.match(/ip=([0-9.]+$)/);
    if (ip) {
        ip = ip[1];
        var urlParsed = url.parse(service.url);
        urlString = urlParsed.protocol + '//' + ip + (urlParsed.port ? ':' + urlParsed.port : '') + urlParsed.path;
        headers = {
            'Host': urlParsed.hostname,
            'Connection':'close'
        };
        // console.log(service.subject, urlString, headers);
    } else {
        urlString = service.url;
    }

    var req = request({
        url: urlString,
        headers: headers,
        timeout: service.timeout,
        jar: false,
        pool: false,
        // followRedirect: false,
        strictSSL: false
    }, function (error, response, body) {
        // console.log(service.url, error, response && response.statusCode);
        if (!error && response.statusCode === service.expectCode) {
            service.status = 'OK';
        } else {
            service.reason = response && response.statusCode ? response.statusCode : error.code.replace(/^ESOCKETTIMEDOUT$/, 'ETIMEDOUT');
            service.status = 'FAIL(' + service.reason + ')';
        }
        req.abort();
        callback && callback(null, service);
    });
}
