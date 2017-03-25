"use strict";

var fs = require('fs');
var path = require('path');

var openssl = require(__dirname + '/../../openssl');
var config = require(__dirname + '/../../configuration');
var logger = require(__dirname + '/../../logger');


module.exports = {
	generate: function (callback) {
		var sslOn = config.routing.ssl && config.routing.ssl.defaultPreset && config.routing.ssl.presets;
		if (!sslOn) {
			callback();
			return;
		}

		logger.log('info', '======================================================================');
		logger.log('info', 'Beaver SSL generation');
		logger.log('info', '----------------------------------------------------------------------');

		var certPath = path.normalize(config._outputPath + '/beaver-ssl');
		if (!fs.existsSync(certPath)) {
			fs.mkdirSync(certPath);
		}

		openssl.generateCa(certPath, function (err) {
			if (err) {
				callback && callback(err);
				return;
			}
			openssl.generate(certPath, config._hostname, function () {
				logger.log('debug', 'beaver-ssl done...');
				callback(err, true);
			});
		});
	}
};
