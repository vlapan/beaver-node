var fs = require('fs');
var os = require('os');
var path = require('path');

var argv = require(__dirname + '/lib/argv');
var logger = require(__dirname + '/lib/logger');

var platforms = require(path.normalize(__dirname + '/lib/platforms'));
var platform = os.platform();
if (argv.p) {
	platform = argv.p;
}

if (!~platforms.available.indexOf(platform)) {
	logger.error('"' + platform + '" platform is not available');
	logger.error('try override option "-p freebsd", possible: ' + platforms.available.join(', '));
	process.exit();
}


var config = require(__dirname + '/lib/configuration');

var extensions = require(__dirname + '/lib/extensions');

if (argv.i) {
	extensions.generate(callback);
} else if (argv.d) {
	callback();
}

function callback() {
	if (argv.d) {
		if (argv.i) {
			function fileDaemonNote() {
				logger.log('info', 'Daemon mode, watching config file "' + argv.i + '"!');
			}
			fileDaemonNote();

			fs.watchFile(path.resolve(argv.i), function (curr, prev) {
				logger.log('info', 'config file, modification detected "' + argv.i + '"!');
				config.readFile();
				extensions.generate(daemonNote);
			});
		}

		if (argv.sslPrefix) {
			function serverDaemonNote() {
				logger.log('info', 'Daemon mode, listening ' + argv.httpsPort + '!');
			}
			serverDaemonNote();

			var express = require('express');
			var https = require('https');
			var app = express();

			var basicAuth = require('basic-auth');
			var pam = require('authenticate-pam');
			var auth = function (req, res, next) {
				function unauthorized(res) {
					res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
					return res.status(401).end();
				}

				var user = basicAuth(req);

				if (!user || !user.name || !user.pass || req.body.logout) {
					return unauthorized(res);
				}

				pam.authenticate(user.name, user.pass, function (err) {
					if (err) {
						logger.error(err);
						return unauthorized(res);
					} else {
						logger.log('info', '"' + user.name + '" user authenticated!');
						return next();
					}
				});
			};

			var bodyParser = require('body-parser');
			app.use(bodyParser.urlencoded({
				extended: false
			}));

			app.use(auth);

			app.get('/', function (req, res) {
				res.send('<form action="/" method="post" enctype="application/x-www-form-urlencoded"><input type="submit" name="logout" value="Logout"><input type="submit"><textarea name="config" style="width:100%;height:500px;"></textarea></form>');
			});

			app.post('/', function (req, res) {
				logger.log('info', 'https: new configuration!');
				config.set(JSON.parse(req.body.config));
				extensions.generate(function () {
					res.send('Done!');
					serverDaemonNote();
				});
			});

			var server = https.createServer({
				key: fs.readFileSync(path.normalize(argv.sslPrefix + '.key')),
				cert: fs.readFileSync(path.normalize(argv.sslPrefix + '.crt'))
			}, app).listen(argv.httpsPort);
		}
	}
}
