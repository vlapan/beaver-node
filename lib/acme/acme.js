const fs = require('fs');
const fse = require('fs-extra');
const childProcess = require('child_process');

const argv = require(`${__dirname}/../argv`);
const logger = require(`${__dirname}/../logger`);

const tls = require('tls');
const http = require('http');
const https = require('https');

const async = require('async');
const tar = require('tar');

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
    const hostToMaster = {};
    for (const account of Object.values(this.config.accounts)) {
        if (!account.master) {
            continue;
        }
        if (account.master === argv.hostname) {
            this.master = true;
        }
        account.domains.forEach(function (domain) {
            hostToMaster[domain.commonName] = account.master;
            domain.altNames.forEach(function (altName) {
                hostToMaster[altName] = account.master;
            });
        });
    }

    http.createServer((req, res) => {
        const {host} = req.headers;
        const presetMaster = hostToMaster[host];
        if (!presetMaster) {
            res.statusCode = 404;
            res.end();
        } else if (presetMaster === argv.hostname) {
            fs.readFile(`${acmeWebPath}/${req.url}`, (err, data) => {
                if (err) {
                    res.statusCode = 404;
                    res.end();
                } else {
                    res.setHeader('Content-Type', 'text/plain');
                    res.end(data);
                }
            });
        } else {
            console.log(req.path);
            http.request({
                host: presetMaster,
                path: req.url,
                headers: {
                    Host: req.headers.host
                },
                timeout: 10000,
            }, (x) => {
                let y = '';
                console.log(`STATUS: ${x.statusCode}`);
                console.log(`HEADERS: ${JSON.stringify(x.headers)}`);
                x.setEncoding('utf8');
                x.on('data', (chunk) => {
                    console.log(`BODY: ${chunk}`);
                    y += chunk;
                });
                x.on('end', () => {
                    console.log('No more data in response.');
                    res.statusCode = x.statusCode;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end(y);
                });
                x.on('error', function (err) {
                    logger.log('error', `acme: error: "${err}"`);
                    res.statusCode = 500;
                    res.end();
                });
            }).on('timeout', function () {
                logger.log('error', `acme: error: timeout`);
                this.abort();
                res.statusCode = 504;
                res.end();
            }).on('error', function (err) {
                logger.log('error', `acme: error: '${err}'`);
                res.statusCode = 500;
                res.end();
            }).end();
        }
    }).on('clientError', (err, socket) => {
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
        cleanTemp(callback) {
            fse.remove(`${tempPath}/${preset}`, function (err) {
                if (err) {
                    logger.log('error', `acme: pull preset: ${preset}: error while deleting preset temp directory: ${err}`);
                }
                callback();
            });
        },
        request(callback) {
            logger.log('info', `acme: pull preset: ${preset}: requesting from '${master}' master`);
            https.request({
                hostname: master,
                port: argv.httpsPort,
                path: `/presets/${preset}/archive.tar.gz?serial=${serial}`,
                method: 'GET',
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
                callback(true);
            }).on('error', function (err) {
                logger.log('error', `acme: pull preset: ${preset}: error: "${err}"`);
                callback(true);
            }).end();
        },
        checkDirectory(callback) {
            fs.exists(`${tempPath}/${preset}`, (exists) => {
                if (!exists) {
                    logger.log('error', `acme: pull preset: ${preset}: preset directory not found`);
                    return callback(true);
                }
                return callback();
            });
        },
        checkSerial(callback) {
            fs.readFile(`${tempPath}/${preset}/serial`, 'utf-8', function (err, data) {
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
        remove(callback) {
            fse.remove(accountPath, (err) => {
                if (err) {
                    logger.log('error', `acme: pull preset: ${preset}: error while deleting preset directory: ${err}`);
                    return callback(true);
                }
                return callback();
            });
        },
        move(callback) {
            fse.move(`${tempPath}/${preset}`, accountPath, (err) => {
                if (err) {
                    logger.log('info', `acme: pull preset: ${preset}: error while moving temp directory: ${err}`);
                    return callback(true);
                }
                return callback();
            });
        },
    }, (err, result) => {
        if (err) {
            return;
        }
        console.log(result);
        logger.log('info', `acme: pull preset: ${preset}: executing hook`);
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
    })
};

Acme.prototype.setConfigChanged = function () {
    logger.log('debug', `acme: config change detected "${this.options.data}"`);
    this.configChanged = true;
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

    if (!this.config.interval) {
        logger.log('verbose', `acme: interval not found, using default interval ${this.options.interval}`);
        this.config.interval = this.options.interval | 0;
    }

    this.config.hostname = argv.hostname;

    logger.log('info', `acme: config loaded, ${this.getSettingsString()}`);
};

Acme.prototype.processResults = function (data) {
    if (data.error) {
        logger.log('warn', `acme: ${data.error}`);
        return;
    }
    logger.log('debug', 'acme: received successful result from worker.js process');
};

Acme.prototype.workerExitHandler = function (code, signal) {
    logger.log('debug', 'acme: worker.js exit event', code, signal);
    this.active = false;
    this.watch();
};

Acme.prototype.start = function () {
    if (this.active) {
        return;
    }
    if (this.configChanged || !this.config || this.config.disabled) {
        this.watch();
        return;
    }
    if (!fs.existsSync(`${__dirname}/worker.js`)) {
        logger.log('debug', 'acme: module file not found worker.js');
        this.watch();
        return;
    }

    if (!this.master) {
        return;
    }

    this.active = true;

    logger.log('debug', `acme: forking worker.js process, ${this.getSettingsString()}`);

    const child = childProcess.fork(`${__dirname}/worker.js`);
    child.on('message', this.processResults.bind(this));
    child.on('error', this.workerExitHandler.bind(this));
    child.on('exit', this.workerExitHandler.bind(this));
    child.send(this.config);
};

Acme.prototype.watch = function () {
    if (this.configChanged) {
        this.readConfig();
    }

    clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(this.start.bind(this), this.config.interval || this.options.interval);
    if (global.gc) {
        global.gc();
    }
};

module.exports = Acme;
