const http = require('node:http');
const debug = require('debug')('beaver:daemons:git-static:http-server');

const events = require('./events');

const { checkSecret } = require('./secret');

function getServer(options) {
    const bindHost = (typeof options === 'object' && typeof options.host === 'string' && options.host) || 'localhost';
    const bindPort = (typeof options === 'object' && options?.port) || 7708;

    debug(`starting server: ${bindHost}:${bindPort}`);
    return http.createServer((req, res) => {
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
        for (const [repositoryKey, repository] of Object.entries(config.repositories)) {
            if (typeof updateHook !== 'string') {
                continue;
            }
            if (!repository.updateHook.endsWith(updateHook)) {
                continue;
            }
            if (typeof repository.updateHookSecret === 'string' && !checkSecret(repository.updateHookSecret, req.headers, req.body)) {
                debug('bad secret');
                continue;
            }
            repositories.push(repositoryKey);
        }
        events.pushEvent(config, repositories);
        res.end('OK');
    }).on('clientError', (err, socket) => {
        debug(`client error: ${err}`);
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }).listen(bindPort, bindHost);
}

module.exports = getServer;
