const http = require('http');
const debug = require('debug')('beaver:daemons:git-static:http-server');

module.exports = (options) => {
    const bindHost = typeof options === 'object' && options.host || 'localhost';
    const bindPort = typeof options === 'object' && options.port || 7708;

    debug(`starting server: ${bindHost}:${bindPort}`);
    http.createServer((req, res) => {
        const {host} = req.headers;
        debug(`host: ${host}`);
        debug(`headers: ${JSON.stringify(req.headers, null, 4)}`);
        res.end('OK');
    }).on('clientError', (err, socket) => {
        debug(`client error: ${err}`);
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }).listen(bindPort, bindHost);
};
