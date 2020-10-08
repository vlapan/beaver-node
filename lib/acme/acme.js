const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const childProcess = require('child_process');

const tls = require('tls');
const http = require('http');
const https = require('https');
const Stream = require('stream');

const async = require('async');
const tar = require('tar');

const argv = require('../argv');
const logger = require('../logger');
const notificator = require('../notificator');
const { file } = require('../utils/tpl');

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
        const {host} = req.headers;
        const presetMaster = this.hostToMaster[host];
        if (!presetMaster) {
            logger.log('error', `acme: http server: error: no preset master found for '${host}'`);
            res.statusCode = 404;
            res.end();
        } else if (presetMaster === argv.hostname) {
            const file = `${acmeWebPath}/${req.url}`;
            logger.log('info', `acme: http server: reading file '${file}'`);
            fs.readFile(file, (err, data) => {
                if (err) {
                    logger.log('error', `acme: http server: error: "${err}"`);
                    res.statusCode = 404;
                    res.end();
                } else {
                    logger.log('info', `acme: http server: reading file: done '${data}'`);
                    res.setHeader('Content-Type', 'text/plain');
                    res.end(data);
                }
            });
        } else {
            logger.log('info', `acme: http server: proxy: route '${req.headers.host}'`);
            logger.log('info', `acme: http server: proxy: preset master '${presetMaster}'`);
            logger.log('info', `acme: http server: proxy: url '${req.url}'`);
            logger.log('info', `acme: http server: proxy: request: start`);
            http.request({
                host: presetMaster,
                path: req.url,
                headers: {
                    Host: req.headers.host
                },
                timeout: 60000,
            }, (x) => {
                let y = '';
                x.setEncoding('utf8');
                x.on('data', (chunk) => {
                    y += chunk;
                });
                x.on('end', () => {
                    logger.log('info', `acme: http server: proxy: request: done`);
                    res.statusCode = x.statusCode;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end(y);
                });
                x.on('error', (err) => {
                    logger.log('error', `acme: http server: proxy: error: '${err}'`);
                    res.statusCode = 500;
                    res.end();
                });
            }).on('timeout', function () {
                logger.log('error', `acme: http server: proxy: error: timeout`);
                res.statusCode = 504;
                this.abort();
            }).on('error', (err) => {
                logger.log('error', `acme: http server: proxy: error: '${err}'`);
                if (res.statusCode < 500) {
                    res.statusCode = 500;
                }
                res.end();
            }).end();
        }
    }).on('clientError', (err, socket) => {
        logger.log('error', `acme: http server: client error: '${err}'`);
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }).listen(argv.httpLocalPort, 'localhost');

    this.pullInterval = 5 * 60 * 1000;
    this.pullPresetsTimeout();
}

Acme.prototype.pullPresetsTimeout = function () {
    clearTimeout(this.pullPresetsTimer);
    this.pullPresets();
    this.pullPresetsTimer = setTimeout(this.pullPresetsTimeout.bind(this), this.pullInterval);
};

Acme.prototype.pullPresets = function () {
    logger.log('info', `acme: pull presets: starting`);
    async.series({
        auth: (callback) => {
            fs.readFile(`${argv.home}/bobot.auth`, 'utf-8', (err, data) => {
                if (err) {
                    logger.log('error', `acme: pull preset: error while reading auth: ${err}`);
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

        for (const [accountKey, account] of Object.entries(this.config.accounts)) {
            if (!account.master) {
                continue;
            }
            if (account.master === argv.hostname) {
                continue;
            }
            const accountPath = `${this.acmePath}/accounts/${accountKey}`;
            fs.readFile(`${accountPath}/serial`, 'utf-8', (err, data) => {
                this.pullPreset(results.ca, results.auth, account.master, accountKey, !err && data.split(' ')[0]);
            });
        }
    });
};

Acme.prototype.pullPreset = function (ca, auth, master, preset, serial) {
    const tempPath = `${this.acmePath}/temp`;
    if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath);
    }
    const accountsPath = `${this.acmePath}/accounts`;
    const accountPath = `${accountsPath}/${preset}`;

    logger.log('info', `acme: pull preset: ${preset}: starting`);

    async.series({
        cleanTemp: (callback) => {
            fse.remove(`${tempPath}/${preset}`, (err) => {
                if (err) {
                    logger.log('error', `acme: pull preset: ${preset}: error while deleting preset temp directory: ${err}`);
                }
                callback();
            });
        },
        request: (callback) => {
            logger.log('info', `acme: pull preset: ${preset}: requesting from '${master}' master`);
            https.request({
                hostname: master,
                port: argv.httpsPort,
                path: `/presets/${preset}/archive.tar.gz?serial=${serial}`,
                method: 'GET',
                ca,
                auth,
                agent: false,
                checkServerIdentity: (host, cert) => {
                    const err = tls.checkServerIdentity(host, cert);
                    if (err) {
                        return err;
                    }
                    return undefined;
                },
                timeout: 10000,
            }, (res) => {
                if (res.statusCode === 200) {
                    res.on('end', () => {
                        logger.log('info', `acme: pull preset: ${preset}: data received`);
                    });
                    res.pipe(tar.extract({
                        strip: 1,
                        cwd: tempPath,
                    })).on('error', (err) => {
                        logger.log('error', `acme: pull preset: ${preset}: data error: ${err}`);
                        callback(true);
                    }).on('finish', () => {
                        logger.log('info', `acme: pull preset: ${preset}: data extracted`);
                        callback();
                    });
                } else if (res.statusCode === 304) {
                    logger.log('info', `acme: pull preset: ${preset}: not modified`);
                    callback(true);
                } else if (res.statusCode === 404) {
                    logger.log('error', `acme: pull preset: ${preset}: not found`);
                    callback(true);
                } else {
                    logger.log('error', `acme: pull preset: ${preset}: master returned code '${res.statusCode}'`);
                    callback(true);
                }
            }).on('timeout', function () {
                logger.log('error', `acme: pull preset: ${preset}: error: timeout`);
                this.abort();
            }).on('error', (err) => {
                logger.log('error', `acme: pull preset: ${preset}: error: "${err}"`);
                callback(true);
            }).end();
        },
        checkDirectory: (callback) => {
            fs.exists(`${tempPath}/${preset}`, (exists) => {
                if (!exists) {
                    logger.log('error', `acme: pull preset: ${preset}: preset directory not found`);
                    return callback(true);
                }
                return callback();
            });
        },
        checkSerial: (callback) => {
            fs.readFile(`${tempPath}/${preset}/serial`, 'utf-8', (err, data) => {
                if (err) {
                    logger.log('error', `acme: pull preset: ${preset}: serial not found`);
                    return callback(true);
                }
                const date = data.split(' ')[0];
                if (!date || !(new Date(date))) {
                    logger.log('error', `acme: pull preset: ${preset}: invalid serial`);
                    return callback(true);
                }
                return callback();
            });
        },
        remove: (callback) => {
            fse.remove(accountPath, (err) => {
                if (err) {
                    logger.log('error', `acme: pull preset: ${preset}: error while deleting preset directory: ${err}`);
                    return callback(true);
                }
                return callback();
            });
        },
        move: (callback) => {
            fse.move(`${tempPath}/${preset}`, accountPath, (err) => {
                if (err) {
                    logger.log('info', `acme: pull preset: ${preset}: error while moving temp directory: ${err}`);
                    return callback(true);
                }
                return callback();
            });
        },
    }, (err, results) => {
        if (err) {
            return;
        }
        const hookPath = `${this.acmePath}/hook`;
        if (fs.existsSync(hookPath)) {
            logger.log('info', `acme: pull preset: ${preset}: executing hook: ${hookPath}`);
            childProcess.exec(hookPath, (error, stdout, stderr) => {
                if (stdout) {
                    logger.log('info', `acme: pull preset: ${preset}: hook stdout: ${stdout}`);
                }
                if (error) {
                    logger.error(`acme: pull preset: ${preset}: hook error: ${error}`);
                    if (stderr) {
                        logger.error(`acme: pull preset: ${preset}: hook stderr: ${stderr}`);
                    }
                    return;
                }
                logger.log('info', `acme: pull preset: ${preset}: done`);
            });
        }
    });
};

Acme.prototype.setConfigChanged = function () {
    logger.log('debug', `acme: config change detected "${this.options.data}"`);
    this.configChanged = true;
    this.watch(1);
};

Acme.prototype.getSettingsString = function () {
    const modeName = this.config.testing ? 'testing' : 'production';
    return `${modeName} mode, interval: ${this.config.interval} ms`;
};

Acme.prototype.parseJSON = function () {
    try {
        this.config = JSON.parse(fs.readFileSync(this.options.data));
        return true;
    } catch (e) {
        return false;
    }
};

Acme.prototype.readConfig = function () {
    this.configChanged = false;

    if (!fs.existsSync(this.options.data)) {
        logger.log('debug', 'acme: input file is not found, empty loop mode');
        this.config = false;
        return;
    }

    if (!this.parseJSON()) {
        logger.log('info', 'acme: config json parse failed, acme disabled, empty loop mode');
        this.config = false;
        return;
    }

    if (this.config.disabled) {
        logger.log('info', 'acme: config loaded, acme disabled, empty loop mode');
        this.config = false;
        return;
    }

    if (!this.config.accounts) {
        this.config.accounts = {};
    }

    if (!this.config.interval) {
        logger.log('verbose', `acme: interval not found, using default interval ${this.options.interval}`);
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

    logger.log('info', `acme: config loaded, ${this.getSettingsString()}`);
};


Acme.prototype.pushPresets = function (presets) {
    logger.log('info', `acme: push presets: starting`);
    async.series({
        auth: (callback) => {
            fs.readFile(`${argv.home}/bobot.auth`, 'utf-8', (err, data) => {
                if (err) {
                    logger.log('error', `acme: push preset: error while reading auth: ${err}`);
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
            fs.readFile(`${accountPath}/serial`, 'utf-8', (err, data) => {
                const archiveStream = tar.create({
                    gzip: true,
                    cwd: accountsPath,
                }, [`./${accountKey}`]);

                logger.log('info', `acme: push preset: ${accountKey}: start`);
                async.each(hostnames, (hostname, cb) => {
                    logger.log('info', `acme: push preset: ${accountKey}: pushing to ${hostname}`);
                    const stream = new Stream.PassThrough();
                    archiveStream.pipe(stream).pipe(this.pushPreset(results.ca, results.auth, hostname, accountKey, !err && data.split(' ')[0], cb));
                }, (err) => {
                    logger.log('info', `acme: push preset: ${accountKey}: done`);
                });
            });
        });
    });
};

Acme.prototype.pushPreset = function (ca, auth, hostname, preset, serial, callback) {
    return https.request({
        hostname,
        port: argv.httpsPort,
        path: `/presets/${preset}/archive.tar.gz?serial=${serial}`,
        method: 'POST',
        ca,
        auth,
        agent: false,
        checkServerIdentity(host, cert) {
            const err = tls.checkServerIdentity(host, cert);
            if (err) {
                return err;
            }
            return undefined;
        },
        timeout: 10000,
    }, (res) => {
        if (res.statusCode === 200) {
            logger.log('info', `acme: push preset: ${preset}: data received`);
            callback();
        } else if (res.statusCode === 304) {
            logger.log('info', `acme: push preset: ${preset}: not modified`);
            callback(true);
        } else if (res.statusCode === 404) {
            logger.log('info', `acme: push preset: ${preset}: not found`);
            callback(true);
        } else {
            logger.log('info', `acme: push preset: ${preset}: master returned code '${res.statusCode}'`);
            callback(true);
        }
    }).on('timeout', function () {
        logger.log('error', `acme: push preset: ${preset}: error: timeout`);
        this.abort();
    }).on('error', (err) => {
        logger.log('error', `acme: push preset: ${preset}: error: "${err}"`);
        callback(true);
    });
};

Acme.prototype.processResults = function (data) {
    if (data.error) {
        logger.log('warn', `acme: ${data.error}`);
        return;
    }
    logger.log('debug', 'acme: received successful result from worker.js process');

    const accountsUpdated = Object.keys(data.changed);
    if (accountsUpdated.length) {
        this.pushPresets(accountsUpdated);
    }

    const changedEntries = Object.entries(data.changed);
    const errorsEntries = Object.entries(data.errors);
    if (changedEntries.length || errorsEntries.length) {
        notificator.notify(file`
            beaver:daemons:acme:report
            Successfully received acme certificates for:
                ${changedEntries.length ? changedEntries.map((item) => `${item[0]}: ${item[1].join(', ')}`).join('\n    ') : '-'}
            Errors:
                ${errorsEntries.length ? errorsEntries.map((item) => `${item[0]}: ${item[1]}`).join('\n    ') : '-'}
        `);
    }
};

Acme.prototype.workerExitHandler = function (code, signal) {
    logger.log('debug', `acme: worker.js exit event ${code} ${signal}`);
    this.active = false;
    this.watch();
};

Acme.prototype.start = function () {
    logger.log('debug', `acme: active: ${this.active}, configChanged: ${this.configChanged}, master: ${this.master}`);
    if (this.active) {
        return;
    }
    if (this.configChanged || !this.config || this.config.disabled) {
        this.watch();
        return;
    }

    const workerFile = path.resolve(__dirname, 'worker.js');
    if (!fs.existsSync(workerFile)) {
        logger.log('debug', `acme: module file not found '${workerFile}'`);
        this.watch();
        return;
    }

    if (!this.master) {
        return;
    }

    this.active = true;

    logger.log('debug', `acme: forking worker.js process, ${this.getSettingsString()}`);

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
