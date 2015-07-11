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
			target.forEach(function (item) {
				if (typeof item === 'string') {
					var isStatic = item.match(/^(https?):\/\//i);
					if (isStatic && isStatic[1] !== protocol) {
						return;
					}
					hosts.push('server ' + item.replace(/^https?:\/\//gi, '') + ' weight=3 max_fails=1 fail_timeout=10s');
					counter++;
				} else if (typeof item === 'object') {
					if (!item.external) {
						var targetPort = config.routing.types[item.type || 'unix'].level6[secure ? 'secure' : 'plain'];
						hosts.push('server ' + ((item.lan && item.lan.ip) || (item.wan && item.wan.ip)) + ':' + targetPort + ' weight=3 max_fails=1 fail_timeout=10s');
						counter++;
					} else if (item.external && !external) {
						var ip = config.locations[item.location].ext.tcp.ip;
						var backup = localLocation && !secure ? ' backup' : '';
						var list = localLocation && secure ? hostsExternal : hosts;
						localLocation && secure && hosts.push('server 127.0.0.1:81 weight=3 max_fails=1 fail_timeout=10s backup');
						if (localLocation && secure && item.wan) {
							list.push('server ' + item.wan.ip + ':443 weight=3 max_fails=1 fail_timeout=10s');
						} else {
							if (config._routes[ip]) {
								var routers = config._routes[ip];
								routers.forEach(function (host) {
									if (!host.wan) {
										return;
									}
									list.push('server ' + host.wan.ip + ':' + ((secure ? 443 : 80) + (item.tcpShift | 0)) + ' weight=3 max_fails=1 fail_timeout=10s' + backup);
								});
							} else {
								list.push('server ' + ip + ':' + ((secure ? 443 : 80) + (item.tcpShift | 0)) + ' weight=3 max_fails=1 fail_timeout=10s' + backup);
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

			// nlocation._add('proxy_http_version', '1.1');
			nlocation._add('proxy_set_header', 'Connection ""');
			nlocation._add('proxy_set_header', 'Accept-Encoding ""');
			// nlocation._add('proxy_set_header', 'X-Real-IP $remote_addr');
			nlocation._add('proxy_set_header', 'X-Forwarded-For $proxy_add_x_forwarded_for');
			nlocation._add('proxy_set_header', 'Host $host');
			if (secure) {
				nlocation._add('proxy_set_header', 'Secure true');
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

				nserver._add('listen', 81);
				nserver._add('server_name', route + ' *.' + route);

				var nlocation = nserver['location /'];
				if (!nlocation) {
					nserver._add('location /');
					nlocation = nserver['location /'];
					if (nlocation.length) {
						nlocation = nlocation[nlocation.length - 1];
					}
				}

				// nlocation._add('proxy_http_version', '1.1');
				nlocation._add('proxy_set_header', 'Connection ""');
				nlocation._add('proxy_set_header', 'Accept-Encoding ""');
				// nlocation._add('proxy_set_header', 'X-Real-IP $remote_addr');
				// nlocation._add('proxy_set_header', 'X-Forwarded-For $proxy_add_x_forwarded_for');
				nlocation._add('proxy_set_header', 'Host $host');
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
		var self = this;
		var nginxPath = path.normalize(config._outputPath + '/nginx');
		if (!fs.existsSync(nginxPath)) {
			fs.mkdirSync(nginxPath);
		}

		var siteEnabledPath = path.normalize(nginxPath + '/sites-enabled');
		if (!fs.existsSync(siteEnabledPath)) {
			fs.mkdirSync(siteEnabledPath);
		}

		var certPath = path.normalize(nginxPath + '/cert');
		if (!fs.existsSync(certPath)) {
			fs.mkdirSync(certPath);
		}

		logger.log('info', '======================================================================');
		logger.log('info', 'Nginx configutation generation');
		logger.log('info', '----------------------------------------------------------------------');
		async.parallel({
			openssl: function (callback) {
				var keys = Object.keys(config._routes);
				var tasks = [];
				tasks.push(openssl.saveRootCert.bind(null, certPath));
				tasks.push(openssl.generate.bind(null, certPath, 'default'));
				for (var i = 0, till = keys.length; i < till; i++) {
					var route = keys[i];
					tasks.push(openssl.generate.bind(null, certPath, route));
				}
				async.series(tasks, function (err, result) {
					logger.log('debug', 'nginx cert done...');
					callback(err, result);
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
