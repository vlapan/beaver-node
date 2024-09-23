const fs = require('node:fs');
const fse = require('fs-extra');
const path = require('node:path');
const childProcess = require('node:child_process');

const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
const Stream = require('node:stream');

const async = require('async');
const tar = require('tar');

const debug = require('debug')('beaver:daemons:acme');

const argv = require('../argv');
const notificator = require('../notificator');
const { bobotAuthPath, getBobotJWTCookie } = require('../bobot');

function Acme(options) {
    this.options = options;
    this.active = false;
    this.config = false;
    this.configChanged = false;
    this.readConfig();
    fs.watchFile(this.options.data, this.setConfigChanged.bind(this));

    const acmePath = `${argv.home}/acme`;
    if (!fs.existsSync(acmePath)) {
        fs.mkdirSync(acmePath);
    }
    this.acmePath = acmePath;
    const acmeWebPath = `${acmePath}/www`;
    if (!fs.existsSync(acmeWebPath)) {
        fs.mkdirSync(acmeWebPath);
    }
    const acmeWellKnownPath = `${acmeWebPath}/.well-known`;
    if (!fs.existsSync(acmeWellKnownPath)) {
        fs.mkdirSync(acmeWellKnownPath);
    }
    const acmeChallengePath = `${acmeWellKnownPath}/acme-challenge`;
    if (!fs.existsSync(acmeChallengePath)) {
        fs.mkdirSync(acmeChallengePath);
    }
    if (!this.config) {
        return;
    }

    http.createServer((req, res) => {
        const { host } = req.headers;
        const presetMaster = this.hostToMaster[host];
        if (!presetMaster) {
            this.log('error', `http server: error: no preset master found for '${host}'`);
            res.statusCode = 404;
            res.end();
        } else if (presetMaster === argv.hostname) {
            const file = `${acmeWebPath}/${req.url}`;
            this.log('info', `http server: reading file '${file}'`);
            // TODO: fix, check for regular file first
            fs.readFile(file, (err, data) => {
                if (err) {
                    this.log('error', `http server: error: "${err}"`);
                    res.statusCode = 404;
                    res.end();
                } else {
                    this.log('info', `http server: reading file: done '${data}'`);
                    res.setHeader('Content-Type', 'text/plain');
                    res.end(data);
                }
            });
        } else {
            this.log('info', `http server: proxy: route '${req.headers.host}'`);
            this.log('info', `http server: proxy: preset master '${presetMaster}'`);
            this.log('info', `http server: proxy: url '${req.url}'`);
            this.log('info', 'http server: proxy: request: start');
            http.request({
                host: presetMaster,
                path: req.url,
                headers: {
                    Host: req.headers.host,
                },
                timeout: 60000,
            }, (x) => {
                let y = '';
                x.setEncoding('utf8');
                x.on('data', (chunk) => {
                    y += chunk;
                });
                x.on('end', () => {
                    this.log('info', 'http server: proxy: request: done');
                    res.statusCode = x.statusCode;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end(y);
                });
                x.on('error', (err) => {
                    this.log('error', `http server: proxy: error: '${err}'`);
                    res.statusCode = 500;
                    res.end();
                });
            }).on('timeout', function () {
                debug('http server: proxy: error: timeout');
                res.statusCode = 504;
                this.abort();
            }).on('error', (err) => {
                this.log('error', `http server: proxy: error: '${err}'`);
                if (res.statusCode < 500) {
                    res.statusCode = 500;
                }
                res.end();
            }).end();
        }
    }).on('clientError', (err, socket) => {
        this.log('error', `http server: client error: '${err}'`);
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }).listen(argv.httpLocalPort, '127.0.0.1');

    this.pullInterval = 5 * 60 * 1000;
    this.pullPresetsTimeout();
}

Acme.prototype.log = function (level, message) {
    debug(message);
};

Acme.prototype.pullPresetsTimeout = function () {
    clearTimeout(this.pullPresetsTimer);
    this.pullPresets();
    this.pullPresetsTimer = setTimeout(this.pullPresetsTimeout.bind(this), this.pullInterval);
};

Acme.prototype.pullPresets = function () {
    this.log('info', 'pull presets: starting');
    async.series({
        auth: (callback) => {
            fs.readFile(bobotAuthPath, 'utf8', (err, data) => {
                if (err) {
                    this.log('error', `pull preset: error while reading auth: ${err}`);
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
        cookieJWT: async () => {
            return await getBobotJWTCookie();
        },
    }, (err, results) => {
        if (err) {
            return;
        }

        for (const [accountKey, account] of Object.entries(this.config.accounts)) {
            if (!account.master) {
                continue;
            }
            if (account.master === argv.hostname) {
                continue;
            }
            const accountPath = `${this.acmePath}/accounts/${accountKey}`;
            fs.readFile(`${accountPath}/serial`, 'utf8', (err, data) => {
                this.pullPreset(results.ca, results.auth, results.cookieJWT, account.master, accountKey, !err && data.split(' ')[0]);
            });
        }
    });
};

Acme.prototype.pullPreset = function (ca, auth, cookieJWT, master, preset, serial) {
    const tempPath = `${this.acmePath}/temp`;
    if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath);
    }
    const accountsPath = `${this.acmePath}/accounts`;
    const accountPath = `${accountsPath}/${preset}`;

    this.log('info', `pull preset: ${preset}: starting`);

    async.series({
        cleanTemp: (callback) => {
            fse.remove(`${tempPath}/${preset}`, (err) => {
                if (err) {
                    this.log('error', `pull preset: ${preset}: error while deleting preset temp directory: ${err}`);
                }
                callback();
            });
        },
        request: (callback) => {
            this.log('info', `pull preset: ${preset}: requesting from '${master}' master`);
            https.request({
                hostname: master,
                port: argv.httpsPort,
                path: `/presets/${preset}/archive.tar.gz?serial=${serial}`,
                method: 'GET',
                ca,
                auth,
                agent: false,
                rejectUnauthorized: ca.length > 0,
                headers: {
                    Cookie: cookieJWT,
                },
                checkServerIdentity: (host, cert) => {
                    if (ca.length > 0) {
                        const err = tls.checkServerIdentity(host, cert);
                        if (err) {
                            return err;
                        }
                    }
                    return undefined;
                },
                timeout: 10000,
            }, (res) => {
                if (res.statusCode === 200) {
                    res.on('end', () => {
                        this.log('info', `pull preset: ${preset}: data received`);
                    });
                    res.pipe(tar.extract({
                        strip: 1,
                        cwd: tempPath,
                    })).on('error', (err) => {
                        this.log('error', `pull preset: ${preset}: data error: ${err}`);
                        callback(true);
                    }).on('finish', () => {
                        this.log('info', `pull preset: ${preset}: data extracted`);
                        callback();
                    });
                } else if (res.statusCode === 304) {
                    this.log('info', `pull preset: ${preset}: not modified`);
                    callback(true);
                } else if (res.statusCode === 404) {
                    this.log('error', `pull preset: ${preset}: not found`);
                    callback(true);
                } else {
                    this.log('error', `pull preset: ${preset}: master returned code '${res.statusCode}'`);
                    callback(true);
                }
            }).on('timeout', function () {
                debug(`pull preset: ${preset}: error: timeout`);
                this.abort();
            }).on('error', (err) => {
                this.log('error', `pull preset: ${preset}: error: "${err}"`);
                callback(true);
            }).end();
        },
        checkDirectory: (callback) => {
            fs.exists(`${tempPath}/${preset}`, (exists) => {
                if (!exists) {
                    this.log('error', `pull preset: ${preset}: preset directory not found`);
                    return callback(true);
                }
                return callback();
            });
        },
        checkSerial: (callback) => {
            fs.readFile(`${tempPath}/${preset}/serial`, 'utf8', (err, data) => {
                if (err) {
                    this.log('error', `pull preset: ${preset}: serial not found`);
                    return callback(true);
                }
                const date = data.split(' ')[0];
                if (!date || !(new Date(date))) {
                    this.log('error', `pull preset: ${preset}: invalid serial`);
                    return callback(true);
                }
                return callback();
            });
        },
        remove: (callback) => {
            fse.remove(accountPath, (err) => {
                if (err) {
                    this.log('error', `pull preset: ${preset}: error while deleting preset directory: ${err}`);
                    return callback(true);
                }
                return callback();
            });
        },
        move: (callback) => {
            fse.move(`${tempPath}/${preset}`, accountPath, (err) => {
                if (err) {
                    this.log('info', `pull preset: ${preset}: error while moving temp directory: ${err}`);
                    return callback(true);
                }
                return callback();
            });
        },
    }, (err, results) => {
        if (err) {
            return;
        }
        const hookPath = `${this.acmePath}/hook-publish-nginx`;
        if (fs.existsSync(hookPath)) {
            this.log('info', `pull preset: ${preset}: executing hook: ${hookPath}`);
            childProcess.exec(hookPath, (error, stdout, stderr) => {
                if (stdout) {
                    this.log('info', `pull preset: ${preset}: hook stdout: ${stdout}`);
                }
                if (error) {
                    this.log('error', `pull preset: ${preset}: hook error: ${error}`);
                    if (stderr) {
                        this.log('error', `pull preset: ${preset}: hook stderr: ${stderr}`);
                    }
                    return;
                }
                this.log('info', `pull preset: ${preset}: done`);
            });
        }
    });
};

Acme.prototype.setConfigChanged = function () {
    this.log('debug', `config change detected "${this.options.data}"`);
    this.configChanged = true;
    this.watch(15 * 1000);
};

Acme.prototype.getSettingsString = function () {
    const modeName = this.config.testing ? 'testing' : 'production';
    return `${modeName} mode, interval: ${this.config.interval} ms`;
};

Acme.prototype.parseJSON = function () {
    try {
        this.config = JSON.parse(fs.readFileSync(this.options.data));
        return true;
    } catch {
        return false;
    }
};

Acme.prototype.readConfig = function () {
    this.configChanged = false;

    if (!fs.existsSync(this.options.data)) {
        this.log('debug', 'input file is not found, empty loop mode');
        this.config = false;
        return;
    }

    if (!this.parseJSON()) {
        this.log('info', 'config json parse failed, acme disabled, empty loop mode');
        this.config = false;
        return;
    }

    if (this.config.disabled) {
        this.log('info', 'config loaded, acme disabled, empty loop mode');
        this.config = false;
        return;
    }

    if (!this.config.accounts) {
        this.config.accounts = {};
    }

    if (!this.config.interval) {
        this.log('verbose', `interval not found, using default interval ${this.options.interval}`);
        this.config.interval = this.options.interval | 0;
    }

    this.config.hostname = argv.hostname;

    this.hostToMaster = {};
    for (const account of Object.values(this.config.accounts)) {
        if (!account.master) {
            continue;
        }
        if (account.master === argv.hostname) {
            this.master = true;
        }
        account.domains.forEach((domain) => {
            this.hostToMaster[domain.commonName] = account.master;
            domain.altNames.forEach((altName) => {
                this.hostToMaster[altName] = account.master;
            });
        });
    }

    this.log('info', `config loaded, ${this.getSettingsString()}`);
};

Acme.prototype.pushPresets = function (presets) {
    this.log('info', 'push presets: starting');
    async.series({
        auth: (callback) => {
            fs.readFile(bobotAuthPath, 'utf8', (err, data) => {
                if (err) {
                    this.log('error', `push preset: error while reading auth: ${err}`);
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
        cookieJWT: async () => {
            return await getBobotJWTCookie();
        },
    }, (err, results) => {
        if (err) {
            return;
        }
        presets.forEach((accountKey) => {
            if (accountKey === argv.hostname) {
                return;
            }

            const account = this.config.accounts[accountKey];
            if (!account) {
                return;
            }

            const hostnames = account.slaves;
            if (!Array.isArray(hostnames)) {
                return;
            }

            const accountsPath = `${this.acmePath}/accounts`;
            const accountPath = `${accountsPath}/${accountKey}`;
            fs.readFile(`${accountPath}/serial`, 'utf8', (err, data) => {
                const archiveStream = tar.create({
                    gzip: true,
                    cwd: accountsPath,
                }, [`./${accountKey}`]);

                this.log('info', `push preset: ${accountKey}: start`);
                async.each(hostnames, (hostname, cb) => {
                    this.log('info', `push preset: ${accountKey}: pushing to ${hostname}`);
                    const stream = new Stream.PassThrough();
                    archiveStream.pipe(stream).pipe(this.pushPreset(results.ca, results.auth, results.cookieJWT, hostname, accountKey, !err && data.split(' ')[0], cb));
                }, (err) => {
                    this.log('info', `push preset: ${accountKey}: done`);
                });
            });
        });
    });
};

Acme.prototype.pushPreset = function (ca, auth, cookieJWT, hostname, preset, serial, callback) {
    return https.request({
        hostname,
        port: argv.httpsPort,
        path: `/presets/${preset}/archive.tar.gz?serial=${serial}`,
        method: 'POST',
        ca,
        auth,
        agent: false,
        rejectUnauthorized: ca.length > 0,
        checkServerIdentity(host, cert) {
            if (ca.length > 0) {
                const err = tls.checkServerIdentity(host, cert);
                if (err) {
                    return err;
                }
            }
            return undefined;
        },
        timeout: 10000,
        headers: {
            Cookie: cookieJWT,
        },
    }, (res) => {
        if (res.statusCode === 200) {
            this.log('info', `push preset: ${preset}: data received`);
            callback();
        } else if (res.statusCode === 304) {
            this.log('info', `push preset: ${preset}: not modified`);
            callback(true);
        } else if (res.statusCode === 404) {
            this.log('info', `push preset: ${preset}: not found`);
            callback(true);
        } else {
            this.log('info', `push preset: ${preset}: master returned code '${res.statusCode}'`);
            callback(true);
        }
    }).on('timeout', function () {
        debug(`push preset: ${preset}: error: timeout`);
        this.abort();
    }).on('error', (err) => {
        this.log('error', `push preset: ${preset}: error: "${err}"`);
        callback(true);
    });
};

Acme.prototype.processResults = function (data) {
    if (data.error) {
        this.log('warn', `${data.error}`);
        return;
    }
    this.log('debug', 'received successful result from worker.js process');

    if (data.updated.length > 0) {
        this.pushPresets(data.updated);
    }
    const receivedEntries = Object.entries(data.received);
    const errorsEntries = Object.entries(data.errors);
    if (receivedEntries.length > 0 || errorsEntries.length > 0) {
        let message = 'beaver:daemons:acme:report';
        if (receivedEntries.length > 0) {
            message += `\n    🟩 Successfully received acme certificates for:\n        ${receivedEntries.map((item) => `${item[0]}: ${item[1].join(', ')}`).join('\n        ')}`;
        }
        if (errorsEntries.length > 0) {
            message += `\n    🟥 Errors:\n        ${errorsEntries.map((item) => `${item[0]}:\n            ${Object.entries(item[1]).map((d) => `${d[0]}: ${d[1]}`).join('\n            ')}`).join('\n        ')}`;
        }
        notificator.notify(message);
    }
};

Acme.prototype.workerExitHandler = function (code, signal) {
    this.log('debug', `worker.js exit event ${code} ${signal}`);
    this.active = false;
    this.watch();
};

Acme.prototype.start = function () {
    this.log('debug', `active: ${this.active}, configChanged: ${this.configChanged}, master: ${this.master}`);
    if (this.active) {
        return;
    }
    if (this.configChanged || !this.config || this.config.disabled) {
        this.watch();
        return;
    }

    const workerFile = path.resolve(__dirname, 'worker.js');
    if (!fs.existsSync(workerFile)) {
        this.log('debug', `module file not found '${workerFile}'`);
        this.watch();
        return;
    }

    if (!this.master) {
        return;
    }

    this.active = true;

    this.log('debug', `forking worker.js process, ${this.getSettingsString()}`);

    const child = childProcess.fork(workerFile);
    child.on('message', this.processResults.bind(this));
    child.on('error', this.workerExitHandler.bind(this));
    child.on('exit', this.workerExitHandler.bind(this));
    child.send(this.config);
};

Acme.prototype.watch = function (interval) {
    if (this.configChanged) {
        this.readConfig();
    }

    clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(this.start.bind(this), interval || this.config.interval || this.options.interval);
    if (global.gc) {
        global.gc();
    }
};

module.exports = Acme;
