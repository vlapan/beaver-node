var fs = require('fs');
var exec = require('child_process').exec;

var config = require(__dirname + '/../configuration');
var logger = require(__dirname + '/../logger');

var generateTemplate = fs.readFileSync(__dirname + '/templates/generate.sh', 'UTF-8');

module.exports = function (certPath, route) {
	var prefix = certPath + '/' + route;
	var prefixRoot = certPath + '/root-ca';
	var tempPass = config.routing.ssl.tempPass;
	var subjectPrefix = config.routing.ssl.subjectPrefix;

	if (config.routing.routes[route].ssl) {
		fs.writeFileSync(prefix + '.crt', config.routing.routes[route].ssl.crt, 'UTF-8');
		fs.writeFileSync(prefix + '.key', config.routing.routes[route].ssl.key, 'UTF-8');
	} else {
		fs.writeFileSync(prefixRoot + '.crt', config.routing.ssl.rootCrt, 'UTF-8');
		fs.writeFileSync(prefixRoot + '.key', config.routing.ssl.rootKey, 'UTF-8');

		var generate = generateTemplate.replace(/\%\{([a-z0-9]+)\}/gi, function (match, p1) {
			switch (p1) {
			case 'prefix':
				return prefix;
			case 'prefixRoot':
				return prefixRoot;
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
		exec(generate, function(error, stdout, stderr) {
			if (error) {
				logger.error('openssl generate:', error);
				return;
			}
			// console.log(error, stdout, stderr);
		});
	}
};
