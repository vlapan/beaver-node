var os = require('os');
var path = require('path');

var platform = os.platform();
var platforms = require(path.normalize(__dirname + '/platforms'));
var available = ~platforms.available.indexOf(platform);

module.exports = require('yargs')
	.strict()
	.usage('Cluster configuration builder.\nUsage: beaver -i /path/to/file.json -o /path/to/dir')
	.options('i', {
		alias: 'input',
		demand: true,
		string: true,
		describe: 'input configuration file path'
	})
	.options('o', {
		alias: 'output',
		demand: true,
		string: true,
		describe: 'configuration output directory'
	})
	.options('h', {
		alias: 'hostname',
		string: true,
		describe: 'override hostname, default current (' + os.hostname() + ')'
	})
	.options('p', {
		alias: 'platform',
		string: true,
		describe: 'override platform, default current (' + platform + (available ? ')' : ', NA)') + ' possible: ' + platforms.available.join(', ')
	})
	.options('e', {
		alias: 'extensions',
		string: true,
		default: 'nat,www,dns',
		describe: 'extensions'
	})
	.options('n', {
		alias: 'nat',
		string: true,
		default: 'natd',
		describe: 'nat type, possible: natd, ipfw, ipnat, iptables'
	})
	.options('w', {
		alias: 'www',
		string: true,
		default: 'nginx',
		describe: 'www type, possible: nginx'
	})
	.options('d', {
		alias: 'daemon',
		boolean: true,
		describe: 'launch as daemon, watch input for changes'
	})
	.options('v', {
		alias: 'verbose',
		describe: 'each "v" adds verbosity'
	})
	.count('verbose')
	.argv;
