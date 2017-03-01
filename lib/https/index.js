"use strict";

var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var querystring = require('querystring');

var async = require('async');

var argv = require(__dirname + '/../argv');
var logger = require(__dirname + '/../logger');

var config = require(__dirname + '/../configuration');
var extensions = require(__dirname + '/../extensions');
var checkNet = require(__dirname + '/../check-net');

var sslPrefix = argv.home + '/' + argv.sslPrefix;

function serverDaemonNote() {
	logger.log('info', 'https: daemon mode, listening ' + argv.httpsPort + '!');
}

if (fs.existsSync(sslPrefix + '.key') && fs.existsSync(sslPrefix + '.crt')) {
	logger.log('info', 'https: found https keys "' + path.normalize(sslPrefix) + '.*"');

	serverDaemonNote();

	var express = require('express');
	var app = express();

	app.set('x-powered-by', '');
	app.set('views', path.join(__dirname, 'views'));
	app.set('view engine', 'jade');

	app.use(require('morgan')('dev'));

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
				logger.log('info', 'https: "' + user.name + '" user authenticated!');
				return next();
			}
		});
	};

	var bodyParser = require('body-parser');
	app.use(bodyParser.urlencoded({
		limit: '50mb',
		extended: false
	}));

	app.use(auth);

	var publicPath = path.join(__dirname, 'public');
	app.use(require('serve-favicon')(publicPath + '/favicon.ico'));

	app.use('/monitor-result.txt', express.static(path.join(argv.home, 'monitor-result.txt')));
	app.use(express.static(publicPath));

	app.get('/', function (req, res) {
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
			hostname: config._hostname
		});
	});

	app.post('/', function (req, res) {
		logger.log('info', 'https: new configuration!');
		var sepa = '\n\n-------------------------------------------------------------\n\n';

		config.set(JSON.parse(req.body.config));
		async.parallel({
			config: function (callback) {
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
				if (req.body.forward && fs.existsSync(argv.home + '/bobot.auth')) {
					var auth = fs.readFileSync(argv.home + '/bobot.auth');
					auth = auth.toString().replace(/\s+/gi, '');
					var configData = {
						config: req.body.config
					};
					var tasks = [];
					var forward = [].concat(req.body.forward);
					forward.filter(function (key) {
						return config.vms[key] && config.vms[key].router && key !== config._hostname;
					}).forEach(function (key) {
						tasks.push(function (callback) {
							var host;
							if (req.body[key]) {
								host = req.body[key];
							} else {
								var port = argv.httpsPort | 0;
								var vm = config.vms[key];
								var location = config.locations[vm.location];
								if (vm.wan && vm.wan.ip) {
									host = vm.wan.ip + ":" + port;
								} else if (location.routing.external && vm.tcpShift) {
									host = [].concat(location.routing.external)[0] + ":" + (2 + (vm.tcpShift | 0));
								} else {
									callback('No WAN/External found');
									return;
								}
							}
							//TODO: --cacert
							exec("curl 'https://" + host + "/' -u " + auth + " -H 'Content-Type: application/x-www-form-urlencoded' --data '" + querystring.stringify(configData).replace(/\'/gi, '%27') + "' --compressed --connect-timeout 2 --max-time 30 --silent --show-error --insecure", function (error, stdout, stderr) {
								if (stdout) {
									logger.log('debug', 'curl ' + key + ' stdout:', stdout);
								}
								if (error) {
									logger.error('curl ' + key + ' stderr:', stderr);
									res.write(key + ': host(' + host + '): ' + stderr + sepa);
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

	app.get('/status', function (req, res) {
		res.json({
			status: 1,
			name: argv.hostname,
			version: config.version
		});
	});

	app.get('/peers', function (req, res) {
		if (argv.discover) {
			var discovery = require(__dirname + '/../discovery');
			res.json(discovery());
		} else {
			res.json({});
		}
	});

	app.post('/check-net', function (req, res) {
		checkNet(req.body.host, req.body.port || argv.httpsPort, function(err, result) {
			var auth = fs.readFileSync(argv.home + '/bobot.auth');
			var host = req.body.host + ':' + (req.body.port || argv.httpsPort);
			//TODO: --cacert
			exec("curl 'https://" + host + "/status' -u " + auth + " --connect-timeout 2 --max-time 30 --silent --show-error --insecure", function (error, stdout, stderr) {
				if (stdout) {
					logger.log('debug', 'curl ' + host + ' stdout:', stdout);
				}
				if (error) {
					logger.error('curl ' + host + ' stderr:', stderr);
					res.json(result);
					return;
				}
				result.status = stdout;
				res.json(result);
			});
		});
	});

	var https = require('https');
	var server = https.createServer({
		key: fs.readFileSync(sslPrefix + '.key'),
		cert: fs.readFileSync(sslPrefix + '.crt'),
		// cert: fs.readFileSync(sslPrefix + '.cer'),
		// ca: fs.readFileSync(sslPrefix + '.pem'),
		// requestCert: true,
		// rejectUnauthorized: true,
	}, app).listen(argv.httpsPort);
}
