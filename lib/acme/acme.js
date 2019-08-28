const fs = require('fs');
const childProcess = require('child_process');

const argv = require(`${__dirname}/../argv`);
const logger = require(`${__dirname}/../logger`);

const http = require('http');

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
    http.createServer((req, res) => {
        if (this.config.leader === argv.hostname) {
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
                host : this.config.leader,
                path : req.url,
                headers : {
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
                logger.log('error', `acme: error: "timeout"`);
                this.abort();
                res.statusCode = 504;
                res.end();
            }).on('error', function (err) {
                logger.log('error', `acme: error: "${err}"`);
                res.statusCode = 500;
                res.end();
            }).end();
        }
    }).on('clientError', (err, socket) => {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }).listen(argv.httpLocalPort, 'localhost');
}

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


    logger.log('info', `acme: config loaded, ${this.getSettingsString()}`);
};

Acme.prototype.processResults = function (data) {
    if (data.error) {
        logger.log('warn', `acme: ${data.error}`);
        return;
    }
    logger.log('debug', 'acme: received successful result from worker.js process');

    logger.log('info', 'acme: executing hook:', `${this.acmePath}/hook`);
    childProcess.exec(`${this.acmePath}/hook`, (error, stdout, stderr) => {
        if (stdout) {
            logger.log('debug', 'acme: hook stdout:', stdout);
        }
        if (error) {
            logger.error('acme: hook', error);
            if (stderr) {
                logger.error('acme: hook stderr:', stderr);
            }
        }
    });
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

    if (this.config.leader !== argv.hostname) {
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
