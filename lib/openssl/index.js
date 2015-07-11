"use strict";

var fs = require('fs');
var exec = require('child_process').exec;

var config = require(__dirname + '/../configuration');
var logger = require(__dirname + '/../logger');

var generateTemplate = fs.readFileSync(__dirname + '/templates/generate.sh', 'UTF-8');

var availableKeySizes = [1024, 2048];
var availableSignatureAlgorithms = ['sha1', 'sha256'];

module.exports = {
	saveRootCert: function (certPath, callback) {
		if (!config.routing.ssl || !config.routing.ssl.presets) {
			callback && callback('!config.routing.ssl || !config.routing.ssl.presets');
			return;
		}

		var presets = config.routing.ssl.presets;
		var prefixRoot = certPath + '/root-ca';
		Object.keys(presets).forEach(function(key) {
			var ssl = presets[key];
			fs.writeFileSync(prefixRoot + '-' + key + '.crt', ssl.rootCrt, 'UTF-8');
			fs.writeFileSync(prefixRoot + '-' + key + '.key', ssl.rootKey, 'UTF-8');
		});
		callback && callback();
	},
	generate: function (certPath, route, callback) {
		var prefix = certPath + '/' + route;
		var sslRoute = config.routing.routes[route] && config.routing.routes[route].ssl;

		if (typeof sslRoute === 'object' && sslRoute.crt && sslRoute.key) {
			fs.writeFileSync(prefix + '.crt', sslRoute.crt, 'UTF-8');
			fs.writeFileSync(prefix + '.key', sslRoute.key, 'UTF-8');
			callback && callback(null, true);
			return;
		}

		if (!config.routing.ssl || !config.routing.ssl.presets) {
			callback && callback('!config.routing.ssl || !config.routing.ssl.presets');
			return;
		}

		var defaultPreset = config.routing.ssl.defaultPreset;
		var presets = config.routing.ssl.presets;


		var templateKey = typeof sslRoute === 'string' ? sslRoute : defaultPreset;
		var ssl = presets[templateKey] ? presets[templateKey] : presets[defaultPreset];

		if (!ssl) {
			callback && callback('can not find default ssl preset');
			return;
		}

		var prefixRoot = certPath + '/root-ca-' + templateKey;
		var tempPass = ssl.tempPass;
		var subjectPrefix = ssl.subjectPrefix;

		var expirationDays = ssl.expirationDays | 0 ? ssl.expirationDays | 0 : 365;
		var keySize = ssl.keySize && ~availableKeySizes.indexOf(ssl.keySize | 0) ? ssl.keySize | 0 : 2048;
		var signatureAlgorithm = ssl.signatureAlgorithm && ~availableSignatureAlgorithms.indexOf(ssl.signatureAlgorithm) ? ssl.signatureAlgorithm : 'sha256';

		var generate = generateTemplate.replace(/\%\{([a-z0-9]+)\}/gi, function (match, p1) {
			switch (p1) {
			case 'prefix':
				return prefix;
			case 'prefixRoot':
				return prefixRoot;
			case 'tempPass':
				return tempPass;
			case 'expirationDays':
				return expirationDays;
			case 'keySize':
				return keySize;
			case 'signatureAlgorithm':
				return signatureAlgorithm;
			case 'tempPass':
				return tempPass;
			case 'subjectPrefix':
				return subjectPrefix;
			case 'route':
				return route;
			default:
				break;
			}
			return false;
		});
		exec(generate, function (error, stdout, stderr) {
			if (error) {
				callback && callback('openssl generate: ' + error + ' // ' + stderr);
				return;
			}
			// console.log(error, stdout, stderr);
			callback && callback(null, true);
		});
	}
};
