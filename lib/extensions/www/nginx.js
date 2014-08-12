var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var NginxConfFile = require('nginx-conf').NginxConfFile;

var openssl = require(__dirname + '/../../openssl');
var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');

module.exports = {
	generate: function (callback) {
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

		var generatedCount = 0;
		logger.log('info', '======================================================================');
		logger.log('info', 'Nginx configutation generation');
		logger.log('info', '----------------------------------------------------------------------');
		Object.keys(config._routes).forEach(function (route, index) {
			var routePath = path.normalize(siteEnabledPath + '/' + route + '.conf');
			fs.openSync(routePath, 'w');
			NginxConfFile.create(routePath, function (err, conf) {
				logger.log('debug', '"' + route + '" route...');

				if (err) {
					logger.log('warn', err);
					return;
				}

				conf.on('flushed', function () {
					generatedCount++;
					logger.log('info', '"' + route + '" finished, waiting for other ' + (Object.keys(config._routes).length - generatedCount));
					if (Object.keys(config._routes).length - generatedCount === 0) {
						logger.log('info', 'nginx done!');
						callback && callback(null, true);
					}
				});
				conf.die(routePath);

				function makeHost(port, secure) {
					conf.nginx._add('server');
					var nserver = conf.nginx.server;
					if (nserver.length) {
						nserver = nserver[nserver.length - 1];
					}

					nserver._add('listen', port);
					nserver._add('server_name', route + ' *.' + route);

					if (secure) {
						nserver._add('ssl', 'on');
						nserver._add('ssl_certificate', 'cert/' + route + '.crt');
						nserver._add('ssl_certificate_key', 'cert/' + route + '.key');
						openssl(certPath, route, function(error) {
							conf.live(routePath);
							conf.flush();
							if (error) {
								callback && callback(error);
							}
						});
					}

					nserver._add('proxy_set_header', 'X-Real-IP $remote_addr');
					nserver._add('proxy_set_header', 'X-Forwarded-For $proxy_add_x_forwarded_for');
					nserver._add('proxy_set_header', 'Host $http_host');
					if (secure) {
						nserver._add('proxy_set_header', 'Secure true');
					}

					var nlocation = nserver['location ~ ^/'];
					if (!nlocation) {
						nserver._add('location ~ ^/');
						nlocation = nserver['location ~ ^/'];
						if (nlocation.length) {
							nlocation = nlocation[nlocation.length - 1];
						}
					}

					var target = config._routes[route];
					if (target.length === 1) {
						var item = target[0];
						if (typeof item === 'string') {
							nlocation._add('proxy_pass', item);
						} else if (typeof item === 'object') {
							var targetPort = config.routing.types[item.type || 'unix'].level6[!!secure ? 'secure' : 'plain'];
							if (config.routing.routes[route].localLocation && !item.external) {
								nlocation._add('proxy_pass', 'https://' + (item.lan.ip || item.wan.ip) + ':' + targetPort);
							} else if (!config.routing.routes[route].localLocation && item.external) {
								nlocation._add('proxy_pass', 'https://' + (item.wan.ip || config.locations[item.location].ext.web) + ':' + targetPort);
							}
						}
					} else {
						if (!secure) {
							var key = route.replace(/\./gi, '_');
							var upstream = conf.nginx['upstream ' + key];
							if (!upstream) {
								conf.nginx._add('upstream ' + key);
								upstream = conf.nginx['upstream ' + key];
								if (upstream.length) {
									upstream = upstream[upstream.length - 1];
								}
							}
							target.forEach(function (item) {
								if (typeof item === 'string') {
									upstream._add('server ' + item + ' weight=3 max_fails=1 fail_timeout=2s');
								} else if (typeof item === 'object') {
									var targetPort = config.routing.types[item.type || 'unix'].level6[!!secure ? 'secure' : 'plain'];
									if (config.routing.routes[route].localLocation && !item.external) {
										upstream._add('server ' + (item.lan.ip || item.wan.ip) + ':' + targetPort + ' weight=3 max_fails=1 fail_timeout=2s');
									} else if (!config.routing.routes[route].localLocation && item.external) {
										upstream._add('server ' + (item.wan.ip || config.locations[item.location].ext.web) + ':' + targetPort + ' weight=3 max_fails=1 fail_timeout=2s');
									}
								}
							});
						}
						nlocation._add('proxy_pass', 'https://' + key);
					}
				}

				makeHost(80);

				if (true) { //secure
					makeHost(443, true);
				} else {
					conf.live(routePath);
					conf.flush();
				}
			});
		});
	}
};
