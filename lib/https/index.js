const fs = require('node:fs');
const fse = require('fs-extra');
const path = require('node:path');
const { exec } = require('node:child_process');
const querystring = require('node:querystring');

const tls = require('node:tls');
const https = require('node:https');

const async = require('async');
const tar = require('tar');

const express = require('express');
const basicAuth = require('basic-auth');

const pam = (() => {
    try {
        return require('authenticate-pam');
    } catch {
        return false;
    }
})();

const morgan = require('morgan');

const debug = require('debug')('beaver');
const debugWeb = require('debug')('beaver:daemons:https');

const yaumnrc = require('clean-yaumnrc');

const argv = require('../argv');
const config = require('../configuration');
const extensions = require('../extensions');
const diff = require('../utils/diff');
const checkNet = require('../check-net');
const gitRouter = require('../git-static/api');
const versions = require('../../versions');

const layoutTemplate = require('./views/layout');

const { createSelfSigned } = require('../utils');
const { checkFileExists, checkFilesExists } = require('../utils/fs');

const publicPath = path.join(__dirname, 'public');

const M = {
    async start() {
        const sslPrefix = `${argv.home}/${argv.sslPrefix}`;
        const sslSSPrefix = `${argv.home}/${argv.sslPrefix}-self-signed`;
        const sslPrefixConfigDir = `${argv.home}/ssl`;
        const customSsl = `${sslPrefixConfigDir}/host-${config._hostname}`;
        const ssl = {
            ca: [],
        };
        if (await checkFileExists(`${argv.home}/root-ca.crt`)) {
            ssl.ca.push(await fs.promises.readFile(`${argv.home}/root-ca.crt`));
        }
        if (await checkFilesExists([`${customSsl}.crt`, `${customSsl}.key`])) {
            debugWeb(`found ssl keys "${customSsl}.*"`);
            const [key, cert, caList] = await Promise.all([
                fs.promises.readFile(`${customSsl}.key`),
                fs.promises.readFile(`${customSsl}.crt`),
                fs.promises.readdir(sslPrefixConfigDir).then((files) => Promise.all(files.filter(i => i.match(/^root-ca.*\.ca$/)).map(i => fs.promises.readFile(`${sslPrefixConfigDir}/${i}`)))),
            ]);
            for (const item of caList) {
                ssl.ca.push(item);
            }
            ssl.key = key;
            ssl.cert = cert;
        } else if (await checkFilesExists([`${sslPrefix}.key`, `${sslPrefix}.crt`])) {
            debugWeb(`found ssl keys "${path.normalize(sslPrefix)}.*"`);
            const [key, cert] = await Promise.all([
                fs.promises.readFile(`${sslPrefix}.key`),
                fs.promises.readFile(`${sslPrefix}.crt`),
            ]);
            ssl.key = key;
            ssl.cert = cert;
        } else if (await checkFilesExists([`${sslSSPrefix}.key`, `${sslSSPrefix}.crt`])) {
            debugWeb(`found self-signed ssl keys "${path.normalize(sslSSPrefix)}.*"`);
            const [key, cert] = await Promise.all([
                fs.promises.readFile(`${sslSSPrefix}.key`),
                fs.promises.readFile(`${sslSSPrefix}.crt`),
            ]);
            ssl.key = key;
            ssl.cert = cert;
        } else {
            debugWeb('no ssl keys found, generating self-signed...');
            const {key, cert} = await createSelfSigned();
            ssl.key = key;
            ssl.cert = cert;
            Promise.all([
                fs.promises.writeFile(`${sslSSPrefix}.key`, key),
                fs.promises.writeFile(`${sslSSPrefix}.crt`, cert),
            ]).then(() => debugWeb('self-signed keys saved')).catch((error) => debugWeb(error));
        }
        M.unixcrypt = await import('unixcrypt');
        run(ssl);
    },
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

    app.use('/favicon.ico', express.static(path.join(publicPath, 'favicon.ico')));

    app.use('/versions', async (req, res, next) => {
        if (req.headers['x-forwarded-for'] === undefined && req.socket.remoteAddress.endsWith('127.0.0.1')) {
            return res.json({
                ts: Date.now(),
                hostname: argv.hostname,
                api: 1,
                data: {
                    versions: {
                        node: process.versions.node,
                        beaver: await versions.get('beaver'),
                        yaumnrc: await versions.get('yaumnrc'),
                    },
                },
            });
        }
        next();
    });

    //--- Authentication block

    debugWeb(`enabled authentication methods: ${argv.authenticationMethods}`);

    function askAuthentication(res) {
        res.set('WWW-Authenticate', 'Basic realm="Authorization Required", charset="UTF-8"');
        res.status(401).end();
    }

    function setAuthenticated(res) {
        res.locals.authenticated = true;
        res.locals.username = res.locals.basicData.name;
    }

    const checkAuthentication = (req, res, next) => {
        if (res.locals.authenticated) {
            next();
        } else {
            askAuthentication(res);
        }
    };

    const checkBasicAuthData = (req, res, next) => {
        const basicData = basicAuth(req);

        // username limit: https://github.com/freebsd/freebsd-src/blob/main/sys/sys/param.h#L128
        // password limit: https://github.com/freebsd/freebsd-src/blob/main/include/pwd.h#L112
        if (typeof basicData === 'object' && basicData.name && basicData.name !== 'root' && basicData.name.length <= 32 && basicData.pass && basicData.pass.length <= 128) {
            res.locals.basicData = basicData;
        }

        next();
    };

    const passwdAuth = (req, res, next) => {
        const basicData = res.locals.basicData;
        if (!basicData || res.locals.authenticated || !argv.authenticationMethods.includes('passwd')) {
            next();
            return;
        }
        fs.readFile(`${argv.home}/passwd`, 'utf8', (err, data) => {
            if (err) {
                debugWeb(`passwd: read file error: '${err}'!`);
                next();
            } else {
                const arr = data.split('\n');
                for (const item of arr) {
                    if (item.startsWith(`${basicData.name}:`)) {
                        const passHash = item.split(':').pop();
                        try {
                            if (M.unixcrypt.verify(basicData.pass, passHash)) {
                                setAuthenticated(res);
                            } else {
                                debugWeb(`passwd: auth error: user(${basicData.name}) found but given pass is invalid!`);
                            }
                        } catch (error) {
                            debugWeb(`passwd: hash error: ${error}`);
                        }
                        next();
                        return;
                    }
                }
                debugWeb(`passwd: auth error: user(${basicData.name}) is not found!`);
                next();
            }
        });
    };

    const pamAuth = (req, res, next) => {
        const basicData = res.locals.basicData;
        if (!basicData || !pam || res.locals.authenticated || !argv.authenticationMethods.includes('pam')) {
            next();
            return;
        }
        pam.authenticate(basicData.name, basicData.pass, (err) => {
            if (err) {
                debugWeb(`pam: auth error: '${err}'!`);
            } else {
                setAuthenticated(res);
            }
            next();
        });
    };

    app.post('/logout', (req, res) => {
        res.status(200).end();
    });
    app.get('/logout.force', (req, res) => {
        res.set('Clear-Site-Data', '"*"');
        askAuthentication(res);
    });
    app.use(checkBasicAuthData);
    app.use(passwdAuth);
    app.use(pamAuth);
    app.get('/logout', (req, res) => {
        res.set('Clear-Site-Data', '"*"');
        if (res.locals.authenticated) {
            res.status(401).end(layoutTemplate.layoutLogout({
                hostname: config._hostname,
            }));
            debugWeb(`"${res.locals.username}" logout`);
        } else {
            res.set('Location', '/')
            res.status(302).end();
        }
    });
    app.use(checkAuthentication);

    //---

    app.use(express.urlencoded({
        limit: '50mb',
        extended: false,
    }));

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

    app.post('/approve', async (req, res) => {
        res.header('Transfer-Encoding', 'chunked');
        res.set('Content-Type', 'text/html');
        const a = await config.loadClean();
        if (a) {
            const data = JSON.parse(req.body.config);
            const parser = yaumnrc.parse(data);
            const b = JSON.parse(`${parser.toSourceNonSecure()}`);
            const changes = diff(a, b).map((x) => {
                if (x.match(/\s+\+/)) {
                    return `<span>&nbsp;<span style="color:#0f0;font-weight:bold;">+</span>&nbsp;${x.split('+ ')[1]}</span>`;
                } else if (x.match(/\s+-/)) {
                    return `<span>&nbsp;<span style="color:#f00;font-weight:bold;">-</span>&nbsp;${x.split('- ')[1]}</span>`;
                }
                return `<b>${x}</b>`;
            });
            res.end(layoutTemplate.approve({
                hostname: config._hostname,
                changes: `${changes.length ? '' : '<i>No changes</i>'}${changes.length ? `${changes.join('<br>')}` : ''}`,
                body: req.body,
            }));
        } else {
            res.end(layoutTemplate.approve({
                hostname: config._hostname,
                changes: '<i>no previous version</i>',
                body: req.body,
            }));
        }
    });

    const sepa = `\n\n${'-'.repeat(80)}\n\n`;
    const authFilePath = `${argv.home}/bobot.auth`;
    app.post('/', async (req, res, next) => {
        res.header('Transfer-Encoding', 'chunked');
        res.set('Content-Type', 'text/plain');
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
                ac: new AbortController(),
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
                return config.servers[key] && config.servers[key].router && key !== config._hostname;
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
                        rejectUnauthorized: !!ssl.ca.length,
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
                            res.write(`${sepa}${x.key}:(${x.host}:${x.port}): ${data}`);
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
                        res.status(500).write(`${sepa}${x.key}:(${x.host}:${x.port}): ${e.message}`);
                        debugWeb(`remote configuration:${x.key}:(${x.host}:${x.port}):error: ${e.message}`);
                        resolve();
                    });
                    checkRequest.write(body);
                    checkRequest.end();
                });
            });
            await Promise.all(forward);
        }
        return res.end();
    });

    app.get('/status', (req, res) => {
        res.json({
            date: new Date(),
            status: 1,
            name: argv.hostname,
            version: config.version,
        });
    });

    app.post('/check-net', async (req, res) => {
        const host = req.body.host;
        const port = req.body.port || argv.httpsPort;
        if (!await checkFileExists(authFilePath)) {
            res.json({
                type: 'closed',
                date: new Date(),
                host: host,
                port: port,
                reason: 'no auth',
            });
            return;
        }
        checkNet(host, port, async (e, r) => {
            const result = { ...r };
            const auth = await fs.promises.readFile(authFilePath, 'utf8');
            const hostPort = `${host}:${port}`;
            debugWeb(`check-net: trying ${hostPort}`);
            const options = {
                hostname: host,
                port,
                path: '/status',
                method: 'GET',
                auth: auth.trim(),
                agent: false,
                ca: ssl.ca,
                rejectUnauthorized: !!ssl.ca.length,
                checkServerIdentity(host, cert) {
                    return undefined;
                },
            };
            const checkRequest = https.request(options, (res1) => {
                res1.on('data', (data) => {
                    result.status = JSON.parse(data);
                    debugWeb(`check-net: host ${hostPort} is OK`);
                    res.json(result);
                });
            });
            checkRequest.on('socket', (socket) => {
                socket.setTimeout(2000);
                socket.on('timeout', () => {
                    checkRequest.destroy();
                });
            });
            checkRequest.on('error', (e) => {
                debugWeb(`check-net: ${hostPort} error: ${e.message}`);
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
        const debugAcme = debug.extend('acme');
        const log = function (level, message) {
            debugAcme(message);
        };
        app.get('/presets/:preset/archive.tar.gz', (req, res) => {
            const { preset } = req.params;
            const { serial } = req.query;
            const accountPath = `${acmeAccountsPath}/${preset}`;
            fs.exists(accountPath, (accountExists) => {
                if (!accountExists) {
                    log('info', `acme: preset: ${preset}: data extracted`);
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
                        log('info', `acme: preset: ${preset}: data extracted`);
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
                        log('error', `acme: preset: ${preset}: data error: ${err}`);
                        callback(true);
                    }).on('finish', () => {
                        log('info', `acme: preset: ${preset}: data extracted`);
                        callback();
                    });
                }],
                checkDirectory: ['extract', (results, callback) => {
                    fs.exists(`${acmeTempPath}/${preset}`, (exists) => {
                        if (!exists) {
                            log('error', `acme: preset: ${preset}: preset directory not found`);
                            return callback(true);
                        }
                        return callback();
                    });
                }],
                checkSerial: ['checkDirectory', (results, callback) => {
                    fs.readFile(`${acmeTempPath}/${preset}/serial`, 'utf-8', (err, data) => {
                        if (err) {
                            log('error', `acme: preset: ${preset}: serial not found`);
                            return callback(true);
                        }
                        const date = data.split(' ')[0];
                        if (!date || !(new Date(date))) {
                            log('error', `acme: preset: ${preset}: invalid serial`);
                            return callback(true);
                        }
                        return callback();
                    });
                }],
                remove: ['checkSerial', (results, callback) => {
                    fse.remove(accountPath, (err) => {
                        if (err) {
                            log('error', `acme: preset: ${preset}: error while deleting preset directory: ${err}`);
                            return callback(true);
                        }
                        return callback();
                    });
                }],
                move: ['remove', (results, callback) => {
                    fse.move(`${acmeTempPath}/${preset}`, accountPath, (err) => {
                        if (err) {
                            log('info', `acme: preset: ${preset}: error while moving temp directory: ${err}`);
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
                        log('info', `acme: preset: ${preset}: no hook found`);
                        callback();
                        return;
                    }
                    log('info', `acme: preset: ${preset}: executing hook: ${hookPath}`);
                    exec(hookPath, (error, stdout, stderr) => {
                        if (stdout) {
                            log('info', `acme: preset: ${preset}: hook stdout: ${stdout}`);
                        }
                        if (error) {
                            log(`acme: preset: ${preset}: hook error: ${error}`);
                            if (stderr) {
                                log(`acme: preset: ${preset}: hook stderr: ${stderr}`);
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
                log('info', `acme: preset: ${preset}: done`);
                res.end();
            });
        });
    }

    const server = https.createServer({
        key: ssl.key,
        cert: ssl.cert,
        ca: ssl.ca,
        // requestCert: true,
        // rejectUnauthorized: true,
    }, app).listen(argv.httpsPort);

    debugWeb(`listening on ${argv.httpsPort}`);
    M.stop = () => {
        server.close(() => {
            debugWeb(`stopped!`);
        });
        debugWeb(`stopping...`);
    };
}

module.exports = M;
