var fs = require('fs');
var os = require('os');
var path = require('path');
var exec = require('child_process').exec;
var querystring = require('querystring');

var async = require('async');

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

		var sslPrefix = '/usr/local/etc/beaver/ssl';
		if (argv.sslPrefix) {
			sslPrefix = argv.sslPrefix;
		}

		var prefixExists = fs.existsSync(path.dirname(path.normalize(sslPrefix)));

		if (prefixExists) {
			logger.log('info', 'found https keys "' + path.dirname(path.normalize(sslPrefix)) + '"');

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
				res.send('<form action="/" method="post" enctype="application/x-www-form-urlencoded"><input type="submit" name="logout" value="Logout"><input type="submit"><input type="checkbox" name="forward"><textarea name="config" style="width:100%;height:500px;"></textarea></form>');
			});

			app.post('/', function (req, res) {
				logger.log('info', 'https: new configuration!');
				var sepa = '\n\n-------------------------------------------------------------\n\n';
				async.parallel({
					config: function (callback) {
						config.set(JSON.parse(req.body.config));
						extensions.generate(function (err) {
							if (err) {
								res.write('SELF:' + err + sepa);
							} else {
								res.write('SELF: Done!' + sepa);
							}
							serverDaemonNote();
							callback(err, true);
						});
					},
					forward: function (callback) {
						if (req.body.forward && fs.existsSync('/usr/local/etc/beaver/bobot.auth')) {
							var auth = fs.readFileSync('/usr/local/etc/beaver/bobot.auth');
							auth = auth.toString().replace(/\s+/gi, '');
							var configData = {
								config: req.body.config
							};
							var tasks = [];
							Object.keys(config.vms).filter(function (key) {
								return config.vms[key].router && key !== config._hostname;
							}).forEach(function (key) {
								tasks.push(function (callback) {
									//TODO: --cacert
									exec("curl 'https://" + config.vms[key].wan.ip + ":" + argv.httpsPort + "/' -u " + auth + " -H 'Content-Type: application/x-www-form-urlencoded' --data '" + querystring.stringify(configData).replace(/\'/gi, '%27') + "' --compressed --connect-timeout 2 --max-time 10 --silent --show-error --insecure", function (error, stdout, stderr) {
										if (stdout) {
											logger.log('debug', 'curl ' + key + ' stdout:', stdout);
										}
										if (error) {
											logger.error('curl ' + key + '', error);
											if (stderr) {
												logger.error('curl ' + key + ' stderr:', stderr);
											}
											res.write(key + ': ' + error + (stderr ? ' // ' + stderr : '') + sepa);
											callback(null, true);
											return;
										}
										res.write(key + ': Done!' + sepa);
										callback(null, true);
									});
								});
							});
							async.parallel(tasks, function (err, result) {
								callback(err, result);
							});
						} else {
							callback(null, true);
						}
					}
				}, function (err, result) {
					res.end();
				});
			});

			var server = https.createServer({
				key: fs.readFileSync(path.normalize(sslPrefix + '.key')),
				cert: fs.readFileSync(path.normalize(sslPrefix + '.crt'))
			}, app).listen(argv.httpsPort);
		}
	}
}
