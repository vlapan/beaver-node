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

	app.use(require('static-favicon')());
	app.use(express.static(path.join(__dirname, 'public')));

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
				if (req.body.forward && fs.existsSync('/usr/local/etc/beaver/bobot.auth')) {
					var auth = fs.readFileSync('/usr/local/etc/beaver/bobot.auth');
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

	app.get('/status', function (req, res) {
		res.json({
			status: 1,
			version: config.version
		});
	});

	app.post('/check-net', function (req, res) {
		checkNet(req.body.host, argv.httpsPort, function(err, result) {
			res.json(result);
		});
	});

	var https = require('https');
	var server = https.createServer({
		key: fs.readFileSync(path.normalize(sslPrefix + '.key')),
		cert: fs.readFileSync(path.normalize(sslPrefix + '.crt'))
	}, app).listen(argv.httpsPort);
}
