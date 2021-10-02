const os = require('os');
const net = require('net');
const async = require('async');

process.on('message', parse);

function shutdown() {
    process.exit();
}
process.on('disconnect', shutdown);

function parse(config) {
    if (typeof config !== 'object') {
        process.send({
            error: 'no config',
        }, shutdown);
        return;
    }

    if (!config.tests.length) {
        process.send({
            error: 'no tests',
        }, shutdown);
        return;
    }

    const tasks = [];
    let current = 0;
    const step = ((config.interval - Math.max(config.tcpTimeout, config.webTimeout)) / config.tests.length) | 0;

    config.tests.forEach((service) => {
        const check = service.type === 'tcp' ? checkTcp : checkWeb;
        tasks.push(deferred.bind(null, check.bind(null, service), current));
        current += step;
    });

    async.parallel(tasks, (err, result) => {
        if (!process.connected) {
            process.exit();
        }
        if (err) {
            process.send({
                error: err,
            }, shutdown);
        } else {
            process.send({
                result,
            }, shutdown);
        }
    });
}

function deferred(test, timeout, callback) {
    setTimeout(test.bind(null, callback), timeout);
}

function checkTcp(service, callback) {
    // console.log(Date.now(), service.subject, service.reason);

    if (!service.tries) {
        service.tries = 1;
    }

    const s = new net.Socket();
    s.setNoDelay();

    function setError(reason) {
        service.reason = reason === 'EHOSTDOWN' || reason === 'TIMEOUT' ? 'EHOSTDOWN/TIMEOUT' : reason;
        // service.status = `FAIL(${service.reason})`;
        service.status = 'FAIL';
        s.destroy();
    }

    s.on('close', (data) => {
        if (service.tries === 1 && service.status !== 'OK') {
            service.tries++;
            checkTcp(service, callback);
            return;
        }
        callback && callback(null, service);
    });

    s.setTimeout(service.timeout, setError.bind(null, 'TIMEOUT'));
    s.on('error', (error) => {
        setError(error.code);
    });

    s.connect(service.port, service.ip, () => {
        service.status = 'OK';
        service.reason = undefined;
        s.destroy();
    });
}

const url = require('url');
const http = require('http');
const https = require('https');

function requestWeb(protocol, options, callback) {
    const manager = protocol === 'http' ? http : https;
    const request = manager.request(options, callback).on('error', (err) => {
        callback(err.code);
    }).on('socket', (socket) => {
        socket.setTimeout(options.timeout);
        socket.on('timeout', () => {
            request.abort();
        });
    });
    request.end();
}

function requestCallback(callback, response) {
    const service = this;
    if (typeof response === 'string') {
        service.reason = response;
        service.status = 'FAIL';
    } else {
        if (typeof response === 'undefined') {
            service.reason = 'UNDEFINED';
            service.status = 'FAIL';
        } else if (response.statusCode === service.expectCode) {
            service.reason = undefined;
            service.status = 'OK';
        } else {
            service.reason = response.statusCode;
            service.status = 'FAIL';
        }
        response.on('data', () => {});
        response.on('end', () => {});
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
    const urlParsed = new url.URL(service.url);
    const options = {
        agent: false,
        timeout: service.timeout,
        headers: {
            Connection: 'close',
            'User-Agent': `monitor @ ${os.hostname()}`,
        },
        rejectUnauthorized: false,
    };
    if (service.ip) {
        options.hostname = service.ip;
        options.headers.Host = urlParsed.hostname;
    } else {
        let ip = service.subject.match(/ip=([0-9.]+$)/);
        if (ip) {
            ip = ip[1];
            options.hostname = ip;
            options.headers.Host = urlParsed.hostname;
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
