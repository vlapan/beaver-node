const http = require('node:http');
const debug = require('debug')('beaver:daemons:git-static:http-server');

const express = require('express');

const events = require('./events');

const { checkSecret } = require('./secret');

function getServer(options) {
    const bindHost = (typeof options === 'object' && typeof options.host === 'string' && options.host) || 'localhost';
    const bindPort = (typeof options === 'object' && options?.port) || 7708;

    const app = express();
    app.set('x-powered-by', '');
    app.use((req, res, next) => {
        req.setEncoding('utf8');
        req.rawBody = '';
        req.on('data', function (chunk) {
            req.rawBody += chunk;
        });
        req.on('end', function () {
            next();
        });
    });
    app.use((req, res) => {
        const { host } = req.headers;
        debug(`host: ${host}`);
        debug(`url: ${req.url}`);
        debug(`headers: ${JSON.stringify(req.headers, undefined, 4)}`);
        const config = options.getConfig();
        if (typeof config !== 'object' && !config?.repositories) {
            res.statusCode = 500;
            res.end('ERR');
            return;
        }
        const updateHook = `${host}${req.url}`;
        const repositories = [];
        let error = false;
        for (const [repositoryKey, repository] of Object.entries(config.repositories)) {
            if (typeof updateHook !== 'string') {
                continue;
            }
            if (!repository.updateHook.endsWith(updateHook)) {
                continue;
            }
            if (typeof repository.updateHookSecret === 'string' && !checkSecret(repository.updateHookSecret, req.headers, req.rawBody)) {
                error = true;
                debug('bad secret');
                continue;
            }
            repositories.push(repositoryKey);
        }
        events.pushEvent(config, repositories);
        if (error) {
            res.statusCode = 403;
            res.end('ERR');
        } else {
            res.statusCode = 200;
            res.end('OK');
        }
    });
    debug(`starting server: ${bindHost}:${bindPort}`);
    return http.createServer(app).on('clientError', (err, socket) => {
        debug(`client error: ${err}`);
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }).listen(bindPort, bindHost);
}

module.exports = getServer;
