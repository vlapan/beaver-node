const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;
const querystring = require('querystring');
const https = require('https');

const async = require('async');

const argv = require(`${__dirname}/../argv`);
const logger = require(`${__dirname}/../logger`);

const config = require(`${__dirname}/../configuration`);
const extensions = require(`${__dirname}/../extensions`);
const checkNet = require(`${__dirname}/../check-net`);

const sslPrefix = `${argv.home}/${argv.sslPrefix}`;

function serverDaemonNote() {
  logger.log('info', `https: daemon mode, listening ${argv.httpsPort}!`);
}

if (fs.existsSync(`${sslPrefix}.key`) && fs.existsSync(`${sslPrefix}.crt`)) {
  logger.log('info', `https: found https keys "${path.normalize(sslPrefix)}.*"`);

  serverDaemonNote();

  const express = require('express');
  const app = express();

  app.set('x-powered-by', '');
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'jade');

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
  app.use(express.static(publicPath));

  app.get('/', (req, res) => {
    // var hosts = [];
    // Object.keys(config.vms).forEach(function (key) {
    // 	var item = config.vms[key];
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
          forward.filter(key => config.vms[key] && config.vms[key].router && key !== config._hostname).forEach((key) => {
            tasks.push((callback) => {
              let host;
              if (req.body[key]) {
                host = req.body[key];
              } else {
                const port = argv.httpsPort | 0;
                const vm = config.vms[key];
                const location = config.locations[vm.location];
                if (vm.wan && vm.wan.ip) {
                  host = `${vm.wan.ip}:${port}`;
                } else if (location.routing.external && vm.tcpShift) {
                  host = `${[].concat(location.routing.external)[0]}:${2 + (vm.tcpShift | 0)}`;
                } else {
                  callback('No WAN/External found');
                  return;
                }
              }
              // TODO: --cacert
              exec(`curl 'https://${host}/' -u ${auth} -H 'Content-Type: application/x-www-form-urlencoded' --data '${querystring.stringify(configData).replace(/\'/gi, '%27')}' --compressed --connect-timeout 2 --max-time 30 --silent --show-error --insecure`, (error, stdout, stderr) => {
                if (stdout) {
                  logger.log('debug', `curl ${key} stdout:`, stdout);
                }
                if (error) {
                  logger.error(`curl ${key} stderr:`, stderr);
                  res.write(`${key}: host(${host}): ${stderr}${sepa}`);
                  callback(null, true);
                  return;
                }
                res.write(`${key}: Done!${sepa}`);
                callback(null, true);
              });
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
      const auth = fs.readFileSync(`${argv.home}/bobot.auth`);
      const host = `${req.body.host}:${req.body.port || argv.httpsPort}`;

      const options = {
        hostname: req.body.host,
        port: req.body.port || argv.httpsPort,
        path: '/status',
        method: 'GET',
        auth,
        ca: fs.readFileSync(`${sslPrefix}.ca`),
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

  https.createServer({
    key: fs.readFileSync(`${sslPrefix}.key`),
    cert: fs.readFileSync(`${sslPrefix}.crt`),
    ca: fs.readFileSync(`${sslPrefix}.ca`),
    // cert: fs.readFileSync(sslPrefix + '.cer'),
    // ca: fs.readFileSync(sslPrefix + '.pem'),
    // requestCert: true,
    // rejectUnauthorized: true,
  }, app).listen(argv.httpsPort);
}
