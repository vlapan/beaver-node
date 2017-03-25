"use strict";

var fs = require('fs');
var exec = require('child_process').exec;

var hoek = require('hoek');
var async = require('async');

var config = require(__dirname + '/../configuration');
var logger = require(__dirname + '/../logger');

var generateTemplate = fs.readFileSync(__dirname + '/templates/generate.sh', 'UTF-8');

var availableKeySizes = [1024, 2048];
var availableSignatureAlgorithms = ['sha1', 'sha256'];

module.exports = {
	preparePreset: function (preset) {
		var presets = config.routing.ssl.presets;
		var currentKey = preset['extends'];
		var src = presets[currentKey];
		if (!currentKey || !presets[currentKey]) {
			return preset;
		}
		var parentKey = src['extends'];
		if (parentKey && parentKey !== src['extends']) {
			return hoek.applyToDefaults(this.preparePreset(src), preset);
		}
		return hoek.applyToDefaults(src, preset);
	},
	generateCa: function (certPath, callback) {
		var presets = config.routing.ssl.presets;
		var prefixRoot = certPath + '/root-ca';

		var tasks = [];
		for (var i = 0, keys = Object.keys(presets), till = keys.length; i < till; i++) {
			var key = keys[i];
			var preset = presets[key];
			if (preset['extends']) {
				preset = module.exports.preparePreset(preset);
			}
			if (preset.rootCA) {
				tasks.push(fs.writeFile.bind(null, prefixRoot + '-' + key + '.ca', preset.rootCA, 'UTF-8'));
			}
		}
		async.parallelLimit(tasks, 4, function (err, result) {
			callback && callback(err);
		});
	},
	generateRoot: function (certPath, callback) {
		var presets = config.routing.ssl.presets;
		var prefixRoot = certPath + '/root-ca';

		var tasks = [];
		for (var i = 0, keys = Object.keys(presets), till = keys.length; i < till; i++) {
			var key = keys[i];
			var preset = presets[key];
			if (preset['extends']) {
				preset = module.exports.preparePreset(preset);
			}
			if (preset.rootCA) {
				tasks.push(fs.writeFile.bind(null, prefixRoot + '-' + key + '.ca', preset.rootCA, 'UTF-8'));
			}
			tasks.push(fs.writeFile.bind(null, prefixRoot + '-' + key + '.crt', preset.rootCrt, 'UTF-8'));
			tasks.push(fs.writeFile.bind(null, prefixRoot + '-' + key + '.key', preset.rootKey, 'UTF-8'));
		}
		async.parallelLimit(tasks, 4, function (err, result) {
			callback && callback(err);
		});
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

		var defaultPreset = config.routing.ssl.defaultPreset;
		var presets = config.routing.ssl.presets;


		var templateKey = typeof sslRoute === 'string' ? sslRoute : defaultPreset;
		var preset = presets[templateKey];

		if (!preset) {
			callback && callback('can not find ssl preset(' + templateKey + ') on route(' + route + ')');
			return;
		}

		if (preset['extends']) {
			preset = module.exports.preparePreset(preset);
		}

		var prefixRoot = certPath + '/root-ca-' + templateKey;
		var tempPass = preset.tempPass;
		var subjectPrefix = preset.subjectPrefix;

		var includeRootCA = preset.includeRootCA;
		var expirationDays = preset.expirationDays | 0 ? preset.expirationDays | 0 : 365;
		var keySize = preset.keySize && ~availableKeySizes.indexOf(preset.keySize | 0) ? preset.keySize | 0 : 2048;
		var signatureAlgorithm = preset.signatureAlgorithm && ~availableSignatureAlgorithms.indexOf(preset.signatureAlgorithm) ? preset.signatureAlgorithm : 'sha256';
		var serial = Date.now();

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
			case 'subjectPrefix':
				return subjectPrefix;
			case 'route':
				return route;
			case 'includeRootCA':
				return includeRootCA;
			case 'serial':
				return serial;
			default:
				break;
			}
			return false;
		});

		exec(generate, function (error, stdout, stderr) {
			if (error) {
				callback && callback('openssl generate: ' + error);
				return;
			}
			// console.log(error, stdout, stderr);
			callback && callback(null, true);
		});
	}
};
