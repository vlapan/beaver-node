const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const querystring = require('querystring');

const tls = require('tls');
const https = require('https');

const async = require('async');
const tar = require('tar');

const express = require('express');
const basicAuth = require('basic-auth');
const pam = require('authenticate-pam');
const morgan = require('morgan');

const debug = require('debug')('beaver');
const debugWeb = require('debug')('beaver:daemons:https');

const argv = require(`../argv`);
const logger = require(`../logger`);
const config = require(`../configuration`);
const extensions = require(`../extensions`);
const checkNet = require(`../check-net`);
const gitRouter = require('../git-static/api');

const layoutTemplate = require('./views/layout');

const { checkFileExists, checkFilesExists } = require('../utils/fs');

const publicPath = path.join(__dirname, 'public');

module.exports = {
    // TODO: async/await
    async getSsl(o) {
        const sslPrefix = `${argv.home}/${argv.sslPrefix}`;
        const sslPrefixConfigDir = `${argv.home}/ssl`;
        const customSsl = `${sslPrefixConfigDir}/host-${config._hostname}`;
        if (await checkFilesExists([`${customSsl}.crt`, `${customSsl}.key`])) {
            debugWeb(`found ssl keys "${customSsl}.*"`);
            const [key, cert, ca] = await Promise.all([
                fs.promises.readFile(`${customSsl}.key`),
                fs.promises.readFile(`${customSsl}.crt`),
                fs.promises.readdir(sslPrefixConfigDir).then((files) => {
                    return Promise.all(files.filter(i => i.match(/^root-ca.*\.ca$/)).map(i => fs.promises.readFile(`${sslPrefixConfigDir}/${i}`)));
                }),
            ]);
            run({
                key,
                cert,
                ca,
            });
        } else if (await checkFilesExists([`${sslPrefix}.key`, `${sslPrefix}.crt`])) {
            debugWeb(`found ssl keys "${path.normalize(sslPrefix)}.*"`);
            const [key, cert] = await Promise.all([
                fs.promises.readFile(`${sslPrefix}.key`),
                fs.promises.readFile(`${sslPrefix}.crt`),
            ]);
            const ca = await checkFileExists(`${argv.home}/root-ca.crt`) && await fs.promises.readFile(`${argv.home}/root-ca.crt`);
            run({
                key,
                cert,
                ca,
            });
        } else {
            throw new Error('ssl keys not found!');
        }
    }
};

function run(ssl) {
    debugWeb('start');

    const app = express();

    app.set('x-powered-by', '');

    morgan.token('username', (req, res) => {
        return res.locals.username;
    });

    app.use(morgan(':username::method :status :url :response-time ms :res[content-length] bytes', {
        stream: {
            write: (data) => {
                debugWeb(data.replace(/\n$/, ''));
            },
        },
    }));

    function unauthorized(res) {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
        return res.status(401).end();
    }
    const pamAuth = function (req, res, next) {
        const user = basicAuth(req);

        if (!user || !user.name || user.name === 'root' || !user.pass || req.body.logout) {
            unauthorized(res);
            return;
        }

        pam.authenticate(user.name, user.pass, (err) => {
            if (err) {
                logger.error(err);
                unauthorized(res);
                return;
            }
            res.locals.username = user.name;
            logger.log('info', `https: "${user.name}" user authenticated!`);
            next();
        });
    };

    app.use(express.urlencoded({
        limit: '50mb',
        extended: false,
    }));

    app.use(pamAuth);

    app.use(express.json());

    app.use('/monitor-result.txt', express.static(path.join(argv.home, 'monitor-result.txt')));
    app.use('/config-clean.json', express.static(path.join(argv.home, 'config-clean.json')));

    app.use('/plugins/clean-yaumnrc', express.static(path.dirname(require.resolve('clean-yaumnrc'))));
    app.use('/plugins/lit-html', express.static(path.dirname(require.resolve('lit-html'))));
    app.use('/plugins/ace-builds', express.static(path.dirname(path.dirname(require.resolve('ace-builds')))));

    app.use(express.static(publicPath));

    app.use('/git-static', gitRouter);

    app.get('/', (req, res) => {
        res.end(layoutTemplate.render({
            hostname: config._hostname,
        }));
    });

    const sepa = `\n\n${'-'.repeat(80)}\n\n`;
    const authFilePath = `${argv.home}/bobot.auth`;
    app.post('/', async (req, res, next) => {
        debugWeb(`new configuration posted: ${res.locals.username}`);

        try {
            if (extensions.isLocked()) {
                throw new Error(extensions.lockedErrorMessage);
            }
            await config.set(JSON.parse(req.body.config));
            await extensions.generate({
                argv,
                config,
                debug,
                user: res.locals.username,
            });
            res.write(`${config._hostname}: Done!`);
            debugWeb('local configuration: done');
        } catch (e) {
            res.status(500).end(`${config._hostname}: ${e.message}`);
            debugWeb(`local configuration: failed: ${e.message}`);
            return next(e);
        }

        if (req.body.forward && await checkFileExists(authFilePath)) {
            const auth = await fs.promises.readFile(authFilePath, 'utf8');
            const body = querystring.stringify({
                config: req.body.config,
            });
            const bodyLength = Buffer.byteLength(body);
            const forward = [].concat(req.body.forward).filter((key) => {
                return config.servers[key] && config.servers[key].router && key !== config._hostname
            }).map((key) => {
                let host;
                let port;
                const address = req.body[key];
                if (address) {
                    host = ~address.indexOf(':') ? address.split(':')[0] : address;
                    port = ~address.indexOf(':') ? address.split(':')[1] : argv.httpsPort;
                } else {
                    const vm = config.servers[key];
                    const location = config.parser.locations.map[vm.location];
                    if (vm.wan && vm.wan.ip) {
                        host = vm.wan.ip;
                        port = argv.httpsPort | 0;
                    } else if (location.wan3 && vm.tcpShift) {
                        host = location.wan3;
                        port = 2 + (vm.tcpShift | 0);
                    } else {
                        throw new Error('No WAN/External found');
                    }
                }
                return {
                    key,
                    host,
                    port,
                };
            }).map((x) => {
                return new Promise(function (resolve) {
                    const checkRequest = https.request({
                        hostname: x.host,
                        port: x.port,
                        path: '/',
                        method: 'POST',
                        auth: auth.trim(),
                        agent: false,
                        ca: ssl.ca,
                        checkServerIdentity(host, cert) {
                            // const err = tls.checkServerIdentity(host, cert);
                            // if (err) {
                            //     return err;
                            // }
                            return undefined;
                        },
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Content-Length': bodyLength,
                        },
                    }, (res1) => {
                        res1.on('data', (data) => {
                            if (res1.statusCode !== 200) {
                                res.status(res1.statusCode);
                            }
                            res.write(`${sepa}host(${x.host}:${x.port}): ${data}`);
                            debugWeb(`remote configuration:${x.key}:(${x.host}:${x.port}):data: ${data}`);
                            resolve();
                        });
                    });
                    checkRequest.on('socket', (socket) => {
                        socket.setTimeout(30000);
                        socket.on('timeout', () => {
                            checkRequest.abort();
                        });
                    });
                    checkRequest.on('error', (e) => {
                        res.status(500).write(`${sepa}host(${x.host}:${x.port}): ${e.message}`);
                        debugWeb(`remote configuration:${x.key}:(${x.host}:${x.port}):error: ${e.message}`);
                        resolve();
                    });
                    checkRequest.write(body);
                    checkRequest.end();
                });
            });
            await Promise.all(forward);
        }
        res.end();
    });

    app.get('/status', (req, res) => {
        res.json({
            status: 1,
            name: argv.hostname,
            version: config.version,
        });
    });

    app.post('/check-net', (req, res) => {
        checkNet(req.body.host, req.body.port || argv.httpsPort, (err, result) => {
            const auth = fs.readFileSync(`${argv.home}/bobot.auth`, 'utf-8');
            const host = `${req.body.host}:${req.body.port || argv.httpsPort}`;
            debugWeb(`check-net: trying ${host}`);
            const options = {
                hostname: req.body.host,
                port: req.body.port || argv.httpsPort,
                path: '/status',
                method: 'GET',
                auth: auth.trim(),
                agent: false,
                ca: ssl.ca,
                checkServerIdentity(host, cert) {
                    return undefined;
                },
            };
            const checkRequest = https.request(options, (res1) => {
                res1.on('data', (data) => {
                    result.status = data;
                    debugWeb(`check-net: host ${host} is OK`);
                    res.json(result);
                });
            });
            checkRequest.on('socket', (socket) => {
                socket.setTimeout(2000);
                socket.on('timeout', () => {
                    checkRequest.abort();
                });
            });
            checkRequest.on('error', (e) => {
                debugWeb(`check-net: ${host} error: ${e.message}`);
                result.reason = e.message;
                res.json(result);
            });
            checkRequest.end();
        });
    });

    {
        const acmePath = `${argv.home}/acme`;
        const acmeAccountsPath = `${acmePath}/accounts`;
        const acmeTempPath = `${acmePath}/temp`;
        app.get('/presets/:preset/archive.tar.gz', (req, res) => {
            const { preset } = req.params;
            const { serial } = req.query;
            const accountPath = `${acmeAccountsPath}/${preset}`;
            fs.exists(accountPath, (accountExists) => {
                if (!accountExists) {
                    res.statusCode = 404;
                    res.end();
                } else {
                    fs.readFile(`${accountPath}/serial`, 'utf-8', (err, data) => {
                        if (err) {
                            res.statusCode = 404;
                            res.end();
                        } else if (serial && serial === data.split(' ')[0]) {
                            res.statusCode = 304;
                            res.end();
                        } else {
                            tar.create({
                                gzip: true,
                                cwd: acmeAccountsPath,
                            }, [`./${preset}`]).pipe(res);
                        }
                    });
                }
            });
        });
        app.post('/presets/:preset/archive.tar.gz', (req, res) => {
            const { preset } = req.params;
            const accountPath = `${acmeAccountsPath}/${preset}`;
            const hookPath = `${acmePath}/hook`;
            async.auto({
                checkTemp: (callback) => {
                    fs.exists(acmeTempPath, (exists) => {
                        callback(null, exists);
                    });
                },
                makeTemp: ['checkTemp', (results, callback) => {
                    if (!results.checkTemp) {
                        logger.log('info', `https: acme: preset: ${preset}: data extracted`);
                        fs.mkdir(acmeTempPath, (err) => {
                            callback(err);
                        });
                    } else {
                        callback();
                    }
                }],
                extract: ['makeTemp', (results, callback) => {
                    req.pipe(tar.extract({
                        strip: 1,
                        cwd: acmeTempPath,
                    })).on('error', (err) => {
                        logger.log('error', `https: acme: preset: ${preset}: data error: ${err}`);
                        callback(true);
                    }).on('finish', () => {
                        logger.log('info', `https: acme: preset: ${preset}: data extracted`);
                        callback();
                    });
                }],
                checkDirectory: ['extract', (results, callback) => {
                    fs.exists(`${acmeTempPath}/${preset}`, (exists) => {
                        if (!exists) {
                            logger.log('error', `https: acme: preset: ${preset}: preset directory not found`);
                            return callback(true);
                        }
                        return callback();
                    });
                }],
                checkSerial: ['checkDirectory', (results, callback) => {
                    fs.readFile(`${acmeTempPath}/${preset}/serial`, 'utf-8', (err, data) => {
                        if (err) {
                            logger.log('error', `https: acme: preset: ${preset}: serial not found`);
                            return callback(true);
                        }
                        const date = data.split(' ')[0];
                        if (!date || !(new Date(date))) {
                            logger.log('error', `https: acme: preset: ${preset}: invalid serial`);
                            return callback(true);
                        }
                        return callback();
                    });
                }],
                remove: ['checkSerial', (results, callback) => {
                    fse.remove(accountPath, (err) => {
                        if (err) {
                            logger.log('error', `https: acme: preset: ${preset}: error while deleting preset directory: ${err}`);
                            return callback(true);
                        }
                        return callback();
                    });
                }],
                move: ['remove', (results, callback) => {
                    fse.move(`${acmeTempPath}/${preset}`, accountPath, (err) => {
                        if (err) {
                            logger.log('info', `https: acme: preset: ${preset}: error while moving temp directory: ${err}`);
                            return callback(true);
                        }
                        return callback();
                    });
                }],
                checkHook: ['move', (results, callback) => {
                    fs.exists(hookPath, (exists) => {
                        callback(null, exists);
                    });
                }],
                execHook: ['checkHook', (results, callback) => {
                    if (!results.checkHook) {
                        logger.log('info', `https: acme: preset: ${preset}: no hook found`);
                        callback();
                        return;
                    }
                    logger.log('info', `https: acme: preset: ${preset}: executing hook: ${hookPath}`);
                    exec(hookPath, (error, stdout, stderr) => {
                        if (stdout) {
                            logger.log('info', `https: acme: preset: ${preset}: hook stdout: ${stdout}`);
                        }
                        if (error) {
                            logger.error(`https: acme: preset: ${preset}: hook error: ${error}`);
                            if (stderr) {
                                logger.error(`https: acme: preset: ${preset}: hook stderr: ${stderr}`);
                            }
                            return callback(true);
                        }
                        return callback();
                    });
                }],
            }, (err, results) => {
                if (err) {
                    res.statusCode = 500;
                    res.end();
                    return;
                }
                logger.log('info', `https: acme: preset: ${preset}: done`);
                res.end();
            });
        });
    }

    https.createServer({
        key: ssl.key,
        cert: ssl.cert,
        ca: ssl.ca,
        // requestCert: true,
        // rejectUnauthorized: true,
    }, app).listen(argv.httpsPort);

    debugWeb(`listening on ${argv.httpsPort}`);
}
