const fs = require('node:fs');
const tls = require('node:tls');
const https = require('node:https');
const async = require('async');
const debug = require('debug')('beaver:daemons:git-static');

const argv = require('../argv');

function pushEventHttp(ca, auth, hostname, repositoryKey, callback) {
    debug(`push event: ${repositoryKey}: ${hostname}:${argv.httpsPort}`);
    const request = https.request({
        hostname,
        port: argv.httpsPort,
        path: `/git-static/${repositoryKey}`,
        method: 'GET',
        ca,
        auth,
        agent: false,
        rejectUnauthorized: ca.length > 0,
        checkServerIdentity(host, cert) {
            // const err = tls.checkServerIdentity(host, cert);
            // if (err) {
            //     return err;
            // }
            return undefined;
        },
        timeout: 3000,
    }, (res) => {
        if (res.statusCode === 200) {
            debug(`push event: ${repositoryKey}: ${hostname}: data received`);
            callback();
        } else if (res.statusCode === 404) {
            debug(`push event: ${repositoryKey}: ${hostname}: not found`);
            callback(true);
        } else {
            debug(`push event: ${repositoryKey}: ${hostname}: returned code '${res.statusCode}'`);
            callback(true);
        }
    }).on('timeout', () => {
        request.timeouted = true;
        request.abort();
    }).on('error', (err) => {
        debug(`push event: ${repositoryKey}: ${hostname}: error:${request.timeouted ? ' timeout' : ''} "${err}"`);
        callback(true);
    }).end();
}

function pushEvent(config, repositories, skipSelf) {
    if (!repositories || repositories.length === 0) {
        return;
    }
    debug(`push event: starting ${repositories}`);

    // TODO: rewrite
    async.series({
        auth: (callback) => {
            fs.readFile(`${argv.home}/bobot.auth`, 'utf-8', (err, data) => {
                if (err) {
                    debug(`push event: error while reading auth: ${err}`);
                    return callback(true);
                }
                return callback(null, data.replace(/\s+/gi, '').trim());
            });
        },
        ca: (callback) => {
            const ca = [];
            if (fs.existsSync(`${argv.home}/root-ca.crt`)) {
                ca.push(fs.readFileSync(`${argv.home}/root-ca.crt`));
            }
            if (fs.existsSync(`${argv.home}/ssl`)) {
                const files = fs.readdirSync(`${argv.home}/ssl`);
                files.forEach((file) => {
                    if (!file.match(/^root-ca.*\.ca$/)) {
                        return;
                    }
                    ca.push(fs.readFileSync(`${argv.home}/ssl/${file}`));
                });
            }
            callback(null, ca);
        },
    }, (err, results) => {
        if (err) {
            return;
        }

        const { servers } = config;
        if (!Array.isArray(servers)) {
            debug('push event: no servers found');
            return;
        }

        for (const repositoryKey of (typeof repositories === 'string' ? [repositories] : repositories)) {
            async.each(!skipSelf ? servers : servers.filter((item) => {
                return item !== argv.hostname;
            }), (server, cb) => {
                debug(`push event: ${repositoryKey}: pushing to ${server}`);
                pushEventHttp(results.ca, results.auth, server, repositoryKey, cb);
            }, (err) => {
                if (err) {
                    debug(`push event: ${repositoryKey}: error: ${err}`);
                }
            });
        }
    });
}

module.exports = {
    pushEventHttp,
    pushEvent,
};
