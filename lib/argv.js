var os = require('os');
var fs = require('fs');
var path = require('path');

var platform = os.platform();
var platforms = require(path.normalize(__dirname + '/platforms'));
var available = ~platforms.available.indexOf(platform);

var yargs = require('yargs')
	.strict()
	.usage('Cluster configuration builder.\nUsage: beaver -i /path/to/file.json -o /path/to/dir')
	.example('beaver -d', 'run as daemon')
	.options('i', {
		alias: 'input',
		string: true,
		describe: 'input configuration file path'
	})
	.options('o', {
		alias: 'output',
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
		default: 'nat,www,dns,dhcp',
		describe: 'extensions'
	})
	.options('n', {
		alias: 'nat',
		string: true,
		default: 'ipfw',
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
	.options('httpsPort', {
		describe: 'https server port',
		default: 8443
	})
	.options('sslPrefix', {
		describe: 'ssl key and cert prefix'
	})
	.options('hook', {
		describe: 'configuration done hook'
	})
	.options('v', {
		alias: 'verbose',
		describe: 'each "v" adds verbosity'
	})
	.count('verbose');

var argv = yargs.argv;

if (!argv.input && !argv.daemon) {
	console.log(yargs.help());
	process.exit();
}

if (!argv.hostname) {
	argv.hostname = os.hostname();
}

if (!argv.platform) {
	argv.platform = platform;
}

if (!~platforms.available.indexOf(argv.platform)) {
	console.log(yargs.help());
	console.log('"' + argv.platform + '" platform is not available');
	process.exit();
}

if (!argv.hook || !fs.existsSync(argv.hook)) {
	if (fs.existsSync('/usr/local/etc/beaver/hook')) {
		argv.hook = '/usr/local/etc/beaver/hook';
	} else {
		argv.hook = undefined;
	}
}

module.exports = argv;
