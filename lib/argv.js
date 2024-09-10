const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const yargs = require('yargs');
const debug = require('debug');

const platforms = require('./platforms');

const platform = os.platform();
const available = ~platforms.available.indexOf(platform);

yargs
    .strict()
    .usage('Cluster configuration builder.\nUsage: beaver -i /path/to/file.json -o /path/to/dir')
    .example('beaver -d', 'run as daemon')
    .env('BEAVER')
    .options('i', {
        alias: 'input',
        string: true,
        describe: 'input configuration file path',
    })
    .options('o', {
        alias: 'output',
        string: true,
        describe: 'configuration output directory',
    })
    .options('h', {
        alias: 'hostname',
        string: true,
        describe: `override hostname, default current (${os.hostname()})`,
    })
    .options('p', {
        alias: 'platform',
        string: true,
        describe: `override platform, default current (${platform}${available ? ')' : ', NA)'} possible: ${platforms.available.join(', ')}`,
    })
    .options('e', {
        alias: 'extensions',
        string: true,
        default: 'nat,www,dns,dhcp,hosts,monitor,tinc,ssl,acme,git-static,ssh-config',
        describe: 'extensions',
    })
    .options('n', {
        alias: 'nat',
        string: true,
        default: 'ipfw',
        describe: 'nat type, possible: natd, ipfw, ipnat, iptables',
    })
    .options('w', {
        alias: 'www',
        string: true,
        default: 'nginx',
        describe: 'www type, possible: nginx',
    })
    .options('d', {
        alias: 'daemon',
        boolean: true,
        describe: 'launch as daemon, watch input for changes',
    })
    .options('tar', {
        boolean: true,
        describe: 'output will be piped to stdout as gzipped tar',
    })
    .options('authenticationMethods', {
        string: true,
        default: 'pam',
        describe: 'authentication methods, possible: jwt, passwd, pam, pam_helper',
    })
    .options('disableNotify', {
        boolean: true,
        describe: 'disable notification',
    })
    .options('disableDaemonFile', {
        boolean: true,
        describe: 'disable file watch daemon',
    })
    .options('disableDaemonHttps', {
        boolean: true,
        describe: 'disable https daemon',
    })
    .options('disableOverseer', {
        boolean: true,
        describe: 'disable overseer daemon',
    })
    .options('overseerLog', {
        describe: 'overseer daemon log file',
    })
    .options('disableAcme', {
        boolean: true,
        describe: 'disable acme daemon',
    })
    .options('disableGitStatic', {
        boolean: true,
        describe: 'disable git-static daemon',
    })
    .options('httpLocalPort', {
        describe: 'http local control port',
        default: 7707,
    })
    .options('httpGitStaticPort', {
        describe: 'http git-static port',
        default: 7708,
    })
    .options('httpsPort', {
        describe: 'https server port',
        default: 8443,
    })
    .options('home', {
        describe: 'hooks and configs for the scripts',
        default: '/usr/local/etc/beaver',
    })
    .options('replaceHome', {
        describe: 'replace home path',
    })
    .options('hook', {
        describe: 'executes after configuration is done',
    })
    .options('sslPrefix', {
        describe: 'ssl certificates prefix',
        default: 'ssl',
    })
    .options('fastBuild', {
        describe: 'skip some actions',
    })
    .options('nginxCertPath', {
        describe: 'nginx certificates path',
        default: 'cert',
    })
    .options('nginxCertPathAcme', {
        describe: 'nginx acme certificates path',
    })
    .options('dnsPath', {
        describe: 'dns path',
        default: 'master/beaver',
    })
    .options('dnsPathAcme', {
        describe: 'dns acme path',
    })
    .options('v', {
        alias: 'verbose',
        describe: 'each "v" adds verbosity',
    })
    .help('help')
    .count('verbose');

const { argv } = yargs;

if (!argv.input && !argv.daemon) {
    yargs.showHelp();
    process.exit(1);
}

if (!argv.hostname) {
    argv.hostname = os.hostname();
}

if (!argv.platform) {
    argv.platform = platform;
}

if (!~platforms.available.indexOf(argv.platform)) {
    yargs.showHelp();
    throw new Error(`"${argv.platform}" platform is not available`);
}

argv.home = path.resolve(argv.home);
if (!process.env.BEAVER_HOME) {
    process.env.BEAVER_HOME = argv.home;
}

if (!argv.hook || !fs.existsSync(argv.hook)) {
    if (fs.existsSync(path.normalize(`${argv.home}/hook`))) {
        argv.hook = path.normalize(`${argv.home}/hook`);
    }
}

argv.authenticationMethods = argv.authenticationMethods.toLowerCase().match(/\w+/g);
if (!argv.authenticationMethods) {
    argv.authenticationMethods = ['pam'];
}

const levelOption = argv.v | 0;
if (levelOption > 0) {
    const debugValue = (process.env.DEBUG ? (['beaver*'].concat(process.env.DEBUG.split(','))).join(',') : 'beaver*');
    process.env.DEBUG = debugValue;
    debug.enable(debugValue);
}

module.exports = argv;
