const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const querystring = require('querystring');

const tls = require('tls');
const https = require('https');

const async = require('async');
const tar = require('tar');

const argv = require(`${__dirname}/../argv`);
const logger = require(`${__dirname}/../logger`);

const config = require(`${__dirname}/../configuration`);
const extensions = require(`${__dirname}/../extensions`);
const checkNet = require(`${__dirname}/../check-net`);

const sslPrefix = `${argv.home}/${argv.sslPrefix}`;
const sslPrefixConfigDir = `${argv.home}/ssl`;
const customSsl = `${sslPrefixConfigDir}/host-${config._hostname}`;

function serverDaemonNote() {
    logger.log('info', `https: daemon mode, listening ${argv.httpsPort}!`);
}

if (fs.existsSync(`${sslPrefixConfigDir}`) && fs.existsSync(`${customSsl}.key`) && fs.existsSync(`${customSsl}.crt`)) {
    logger.log('info', `https: found https keys "${customSsl}.*"`);
    const key = fs.readFileSync(`${customSsl}.key`);
    const cert = fs.readFileSync(`${customSsl}.crt`);
    fs.readdir(`${sslPrefixConfigDir}`, (err, files) => {
        const ca = [];
        files.forEach((file) => {
            if (!file.match(/^root-ca.*\.ca$/)) {
                return;
            }
            ca.push(fs.readFileSync(`${sslPrefixConfigDir}/${file}`));
        });
        run(key, cert, ca);
    });
} else if (fs.existsSync(`${sslPrefix}.key`) && fs.existsSync(`${sslPrefix}.crt`)) {
    logger.log('info', `https: found https keys "${path.normalize(sslPrefix)}.*"`);
    const key = fs.readFileSync(`${sslPrefix}.key`);
    const cert = fs.readFileSync(`${sslPrefix}.crt`);
    const ca = fs.existsSync(`${argv.home}/root-ca.crt`) && fs.readFileSync(`${argv.home}/root-ca.crt`);
    run(key, cert, ca);
}

function run(key, cert, ca) {
    serverDaemonNote();

    const express = require('express');
    const app = express();

    app.set('x-powered-by', '');
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'pug');

    app.use(require('morgan')('dev'));

    const basicAuth = require('basic-auth');
    const pam = require('authenticate-pam');
    const auth = function (req, res, next) {
        function unauthorized(res) {
            res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
            return res.status(401).end();
        }

        const user = basicAuth(req);

        if (!user || !user.name || !user.pass || req.body.logout) {
            return unauthorized(res);
        }

        pam.authenticate(user.name, user.pass, (err) => {
            if (err) {
                logger.error(err);
                return unauthorized(res);
            }
            logger.log('info', `https: "${user.name}" user authenticated!`);
            return next();
        });
    };

    const bodyParser = require('body-parser');
    app.use(bodyParser.urlencoded({
        limit: '50mb',
        extended: false,
    }));

    app.use(auth);

    const publicPath = path.join(__dirname, 'public');
    app.use(require('serve-favicon')(`${publicPath}/favicon.ico`));

    app.use('/monitor-result.txt', express.static(path.join(argv.home, 'monitor-result.txt')));
    app.use('/config-clean.json', express.static(path.join(argv.home, 'config-clean.json')));

    app.use('/clean-yaumnrc', express.static(path.join(__dirname, '/../../node_modules/clean-yaumnrc')));

    app.use(express.static(publicPath));

    app.get('/', (req, res) => {
        // var hosts = [];
        // Object.keys(config.servers).forEach(function (key) {
        // 	var item = config.servers[key];
        // 	if (!item.router) {
        // 		return;
        // 	}
        // 	if (key === config._hostname) {
        // 		item.self = true;
        // 	}
        // 	hosts.push(item);
        // });
        res.render('form', {
            hostname: config._hostname,
        });
    });

    app.post('/', (req, res) => {
        logger.log('info', 'https: new configuration!');
        const sepa = '\n\n-------------------------------------------------------------\n\n';

        config.set(JSON.parse(req.body.config));
        async.parallel({
            config(callback) {
                extensions.generate((err) => {
                    if (err) {
                        res.write(`SELF:${err}${sepa}`);
                    } else {
                        res.write(`SELF: Done!${sepa}`);
                    }
                    serverDaemonNote();
                    callback(err, true);
                });
            },
            forward(callback) {
                if (req.body.forward && fs.existsSync(`${argv.home}/bobot.auth`)) {
                    let auth = fs.readFileSync(`${argv.home}/bobot.auth`);
                    auth = auth.toString().replace(/\s+/gi, '');
                    const configData = {
                        config: req.body.config,
                    };
                    const tasks = [];
                    const forward = [].concat(req.body.forward);
                    forward.filter(key => config.servers[key] && config.servers[key].router && key !== config._hostname).forEach((key) => {
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
                                ca,
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
                                logger.error(`forward ${host} stderr:`, e.message);
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
        }, (err, result) => {
            res.end();
            setTimeout(process.exit, 500);
        });
    });

    app.get('/status', (req, res) => {
        res.json({
            status: 1,
            name: argv.hostname,
            version: config.version,
        });
    });

    app.get('/peers', (req, res) => {
        if (argv.discover) {
            const discovery = require(`${__dirname}/../discovery`);
            res.json(discovery());
        } else {
            res.json({});
        }
    });

    app.post('/check-net', (req, res) => {
        checkNet(req.body.host, req.body.port || argv.httpsPort, (err, result) => {
            const auth = fs.readFileSync(`${argv.home}/bobot.auth`, 'utf-8');
            const host = `${req.body.host}:${req.body.port || argv.httpsPort}`;
            logger.log('debug', `check-net trying: ${host}`);
            const options = {
                hostname: req.body.host,
                port: req.body.port || argv.httpsPort,
                path: '/status',
                method: 'GET',
                auth: auth.trim(),
                agent: false,
                ca,
                checkServerIdentity(host, cert) {
                    return undefined;
                },
            };
            const checkRequest = https.request(options, (res1) => {
                res1.on('data', (data) => {
                    result.status = data;
                    logger.log('debug', `host ${host} is OK`);
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
                logger.error(`check-net ${host} stderr:`, e.message);
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
            const {preset} = req.params;
            const {serial} = req.query;
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
            const {preset} = req.params;
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
        key,
        cert,
        ca,
        // requestCert: true,
        // rejectUnauthorized: true,
    }, app).listen(argv.httpsPort);
}
