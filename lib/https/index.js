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

        res.locals.username = user.name;
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

    app.use('/clean-yaumnrc', express.static(path.dirname(require.resolve('clean-yaumnrc'))));

    app.use(express.static(publicPath));

    app.use('/git-static', gitRouter);

    app.get('/', (req, res) => {
        res.end(layoutTemplate.render({
            hostname: config._hostname,
        }));
    });

    app.post('/', async (req, res) => {
        const sepa = '\n\n-------------------------------------------------------------\n\n';

        debugWeb('new configuration posted');

        if (extensions.isLocked()) {
            res.end(`SELF: ${extensions.lockedErrorMessage}${sepa}`);
            debugWeb('local configuration: failed');
            throw new Error(extensions.lockedErrorMessage);
        }

        try {
            await config.set(JSON.parse(req.body.config));
        } catch (e) {
            res.end(`SELF: ${e.message}${sepa}`);
            debugWeb('local configuration: failed');
            throw e;
        }

        await async.series({
            async config() {
                try {
                    await extensions.generate({
                        argv,
                        config,
                        debug,
                        user: res.locals.username,
                    });
                    res.write(`SELF: Done!${sepa}`);
                    debugWeb('local configuration: done');
                } catch (e) {
                    res.end(`SELF: ${e.message}${sepa}`);
                    debugWeb('local configuration: failed');
                    throw e;
                }
            },
            forward(callback) {
                const authFilePath = `${argv.home}/bobot.auth`;
                if (req.body.forward && fs.existsSync(authFilePath)) {
                    let auth = fs.readFileSync(authFilePath);
                    auth = auth.toString().replace(/\s+/gi, '');
                    const configData = {
                        config: req.body.config,
                    };
                    const tasks = [];
                    const forward = [].concat(req.body.forward);
                    forward.filter((key) => config.servers[key] && config.servers[key].router && key !== config._hostname).forEach((key) => {
                        tasks.push((callback) => {
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
                                    callback('No WAN/External found');
                                    return;
                                }
                            }

                            const body = querystring.stringify(configData);
                            const options = {
                                hostname: host,
                                port,
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
                                    'Content-Length': Buffer.byteLength(body),
                                },
                            };
                            const checkRequest = https.request(options, (res1) => {
                                res1.on('data', (data) => {
                                    res.write(`${key}: Done!${sepa}`);
                                    logger.log('debug', `host ${host}:${port} is OK`);
                                    callback(null, true);
                                });
                            });
                            checkRequest.on('socket', (socket) => {
                                socket.setTimeout(30000);
                                socket.on('timeout', () => {
                                    checkRequest.abort();
                                });
                            });
                            checkRequest.on('error', (e) => {
                                res.write(`${key}: host(${host}:${port}): ${e.message}${sepa}`);
                                logger.error(`forward ${host} stderr: ${e.message}`);
                                callback(null, true);
                            });
                            checkRequest.write(body);
                            checkRequest.end();
                        });
                    });
                    async.parallel(tasks, (err, result) => {
                        callback(err, result);
                    });
                } else {
                    callback(null, true);
                }
            },
        });
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
