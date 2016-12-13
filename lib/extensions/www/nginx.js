"use strict";

var fs = require('fs');
var path = require('path');

var async = require('async');
var mkdirp = require('mkdirp');
var NginxConfFile = require('nginx-conf').NginxConfFile;

var openssl = require(__dirname + '/../../openssl');
var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

function generateFile(route, routePath, callback) {
	var fail_timeout = '15s';
	var routeTest = '';
	var isDefault = route === 'default';
	fs.openSync(routePath, 'w');
	NginxConfFile.create(routePath, function (err, conf) {
		logger.log('debug', '"' + route + '" route...');

		if (err) {
			logger.log('warn', err);
			return;
		}

		conf.on('flushed', function () {
			callback && callback(null, routeTest);
		});
		conf.die(routePath);

		function makeHost(port, secure) {
			var nserver = conf.nginx._add('server').server;
			if (nserver.length) {
				nserver = nserver[nserver.length - 1];
			}

			nserver._add('listen', port + (isDefault ? ' default_server' : ''));
			nserver._add('server_name', isDefault ? '_' : route + ' *.' + route);

			if (secure) {
				nserver._add('ssl', 'on');
				nserver._add('ssl_certificate', 'cert/' + route + '.crt');
				nserver._add('ssl_certificate_key', 'cert/' + route + '.key');
			}

			if (config.routing.routes[route].root) {
				nserver._add('root', config.routing.routes[route].root);
			}

			var target = config._routes[route];

			if (!target || !target.length) {
				if (isDefault) {
					nserver._add('return 444');
				}
				return;
			}

			var protocol = secure ? 'https' : 'http';
			var key = route.replace(/\./gi, '_');

			var hosts = [];
			var hostsExternal = [];

			var localLocation = config.routing.routes[route].localLocation;
			var external = false;
			var counter = 0;
			var maxFails = 5;
			target.forEach(function (item) {
				if (typeof item === 'string') {
					var isStatic = item.match(/^(https?):\/\//i);
					if (isStatic && isStatic[1] !== protocol) {
						return;
					}
					hosts.push('server ' + item.replace(/^https?:\/\//gi, '') + ' weight=3 max_fails=' + maxFails + ' fail_timeout=' + fail_timeout);
					counter++;
				} else if (typeof item === 'object') {
					if (!item.external) {
						var targetPort = config.routing.types[item.type || 'unix'].level6[secure ? 'secure' : 'plain'];
						hosts.push('server ' + ((item.lan && item.lan.ip) || (item.wan && item.wan.ip)) + ':' + targetPort + ' weight=3 max_fails=' + maxFails + ' fail_timeout=' + fail_timeout);
						counter++;
					} else if (item.external) {
						var backup = localLocation && !secure ? ' backup' : '';
						maxFails = backup ? 3 : 5;
						var list = localLocation && secure ? hostsExternal : hosts;
						localLocation && secure && !external && hosts.push('server 127.0.0.1:81 weight=3 max_fails=3 fail_timeout=' + fail_timeout + ' backup');
						if (localLocation && secure && item.wan) {
							list.push('server ' + item.wan.ip + ':443 weight=3 max_fails=' + maxFails + ' fail_timeout=' + fail_timeout);
						} else {
							var location = config.locations[item.location];
							if (!location) {
								return;
							}

							if (location.routing && location.routing.external) {
								[].concat(location.routing.external).forEach(function (item) {
									list.push('server ' + item + ':' + (secure ? 443 : 80) + ' weight=3 max_fails=' + maxFails + ' fail_timeout=' + fail_timeout + '' + backup);
								});
							} else {
								var ip = location.ext && location.ext.web && location.ext.web.ip;
								if (!ip) {
									return;
								}
								if (config._routes[ip]) {
									var routers = config._routes[ip];
									routers.forEach(function (host) {
										if (!host.wan) {
											return;
										}
										list.push('server ' + host.wan.ip + ':' + (secure ? 443 : 80) + ' weight=3 max_fails=' + maxFails + ' fail_timeout=' + fail_timeout + '' + backup);
									});
								} else {
									list.push('server ' + ip + ':' + (secure ? 443 : 80) + ' weight=3 max_fails=' + maxFails + ' fail_timeout=' + fail_timeout + '' + backup);
								}
							}
						}
						external = true;
						counter++;
					}
				}
			});

			if (counter === 0) {
				return;
			}

			routeTest += 'echo curl -I ' + (secure ? '-k ' : '') + protocol + '://' + config._hostConfig.wan.ip + ' -H "Host: ' + route + '"\n';
			routeTest += 'curl -I ' + (secure ? '-k ' : '') + protocol + '://' + config._hostConfig.wan.ip + ' -H "Host: ' + route + '"\n\n';

			var nlocation = nserver['location /'];
			if (!nlocation) {
				nserver._add('location /');
				nlocation = nserver['location /'];
				if (nlocation.length) {
					nlocation = nlocation[nlocation.length - 1];
				}
			}

			nlocation._add('proxy_pass', (localLocation || !secure ? 'http' : 'https') + '://' + key + '_' + protocol);

			var upstream = conf.nginx['upstream ' + key + '_' + protocol];
			if (!upstream) {
				conf.nginx._add('upstream ' + key + '_' + protocol);
				upstream = conf.nginx['upstream ' + key + '_' + protocol];
				if (upstream.length) {
					upstream = upstream[upstream.length - 1];
				}
			}
			// upstream._add('keepalive', '8');

			hosts.forEach(function (item) {
				upstream._add(item);
			});

			if (hostsExternal.length) {
				var nserver = conf.nginx._add('server').server;
				if (nserver.length) {
					nserver = nserver[nserver.length - 1];
				}

				nserver._add('listen', '127.0.0.1:81');
				nserver._add('server_name', route + ' *.' + route);
				nserver._add('# large transfers hang with bigger buffer values (nginx bug?)');
				nserver._add('proxy_buffering', 'off');
				nserver._add('proxy_buffer_size', '2k');
				nserver._add('proxy_buffers', '32 2k');

				var nlocation = nserver['location /'];
				if (!nlocation) {
					nserver._add('location /');
					nlocation = nserver['location /'];
					if (nlocation.length) {
						nlocation = nlocation[nlocation.length - 1];
					}
				}

				nlocation._add('proxy_pass', 'https://' + key + '_' + protocol + '_backup');

				var upstream = conf.nginx['upstream ' + key + '_' + protocol + '_backup'];
				if (!upstream) {
					conf.nginx._add('upstream ' + key + '_' + protocol + '_backup');
					upstream = conf.nginx['upstream ' + key + '_' + protocol + '_backup'];
					if (upstream.length) {
						upstream = upstream[upstream.length - 1];
					}
				}
				// upstream._add('keepalive', '8');

				hostsExternal.forEach(function (item) {
					upstream._add(item);
				});
			}
		}

		makeHost(80);
		makeHost(443, true);

		conf.live(routePath);
		conf.flush();
	});
}

module.exports = {
	generate: function (callback) {
		logger.log('info', '======================================================================');
		logger.log('info', 'Nginx configutation generation');
		logger.log('info', '----------------------------------------------------------------------');

		var self = this;
		var nginxPath = path.normalize(config._outputPath + '/nginx');
		if (!fs.existsSync(nginxPath)) {
			fs.mkdirSync(nginxPath);
		}

		var siteEnabledPath = path.normalize(nginxPath + '/sites-enabled');
		if (!fs.existsSync(siteEnabledPath)) {
			fs.mkdirSync(siteEnabledPath);
		}

		var sslOn = config.routing.ssl && config.routing.ssl.defaultPreset && config.routing.ssl.presets;
		if (sslOn) {
			var certPath = path.normalize(nginxPath + '/cert');
			if (!fs.existsSync(certPath)) {
				fs.mkdirSync(certPath);
			}
		}

		async.parallel({
			openssl: function (callback) {
				if (!sslOn) {
					return callback(null, true);
				}
				openssl.generateRoot(certPath, function (err) {
					if (err) {
						callback && callback(err);
						return;
					}

					var keys = Object.keys(config._routes);
					var tasks = [];
					tasks.push(openssl.generate.bind(null, certPath, 'default'));
					for (var i = 0, till = keys.length; i < till; i++) {
						var route = keys[i];
						tasks.push(openssl.generate.bind(null, certPath, route));
					}
					async.parallelLimit(tasks, 4, function (err, result) {
						logger.log('debug', 'nginx cert done...');
						callback(err, true);
					});
				});
			},
			conf: function (callback) {
				var generatedCount = 0;
				var outputTest = '';

				var defaultRoutePath = path.normalize(siteEnabledPath + '/default.conf');
				generateFile('default', defaultRoutePath, function (err, routeTest) {});

				Object.keys(config._routes).forEach(function (route) {
					var routePath = path.normalize(siteEnabledPath + '/' + route + '.conf');
					generateFile(route, routePath, function (err, routeTest) {
						generatedCount++;
						if (outputTest) {
							outputTest += routeTest;
						}
						logger.log('info', '"' + route + '" finished, waiting for other ' + (Object.keys(config._routes).length - generatedCount));
						if (Object.keys(config._routes).length - generatedCount === 0) {
							fs.writeFile(nginxPath + '/test_curl.sh', outputTest);
							callback && callback(null, true);
						}
					});
				});
			}
		}, function (err, result) {
			if (err) {
				logger.log('error', 'nginx errors: ' + err);
			} else {
				logger.log('info', 'nginx done!');
			}
			callback && callback(err, true);
		});
	}
};
