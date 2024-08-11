const http = require('node:http');
const debug = require('debug')('beaver:daemons:git-static:http-server');

const events = require('./events');

module.exports = (options) => {
    const bindHost = (typeof options === 'object' && typeof options.host === 'string' && options.host) || 'localhost';
    const bindPort = (typeof options === 'object' && options?.port) || 7708;

    debug(`starting server: ${bindHost}:${bindPort}`);
    http.createServer((req, res) => {
        const { host } = req.headers;
        debug(`host: ${host}`);
        debug(`url: ${req.url}`);
        debug(`headers: ${JSON.stringify(req.headers, null, 4)}`);
        const updateHook = `${host}${req.url}`;
        const repositories = [];
        for (const [repositoryKey, repository] of Object.entries(options.config.repositories)) {
            if (typeof updateHook !== 'undefined') {
                if (updateHook !== repository.updateHook.replace(/http[s]:\/\/?(.*)/i, '$1')) {
                    continue;
                }
            }
            repositories.push(repositoryKey);
        }
        events.pushEvent(options.config, repositories);
        res.end('OK');
    }).on('clientError', (err, socket) => {
        debug(`client error: ${err}`);
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }).listen(bindPort, bindHost);
};
