const os = require('os');
const fs = require('fs');
const path = require('path');

const platforms = require('./platforms');

const platform = os.platform();
const available = ~platforms.available.indexOf(platform);

const yargs = require('yargs')
    .strict()
    .usage('Cluster configuration builder.\nUsage: beaver -i /path/to/file.json -o /path/to/dir')
    .example('beaver -d', 'run as daemon')
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
        default: 'nat,www,dns,dhcp,hosts,monitor,tinc,ssl,acme,git-static',
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
    .options('m', {
        alias: 'discover',
        boolean: true,
        describe: 'discover other beavers',
    })
    .options('disableOverseer', {
        boolean: true,
        describe: 'disable overseer',
    })
    .options('disableAcme', {
        boolean: true,
        describe: 'disable acme',
    })
    .options('disableGitStatic', {
        boolean: true,
        describe: 'disable git-static',
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
    .options('v', {
        alias: 'verbose',
        describe: 'each "v" adds verbosity',
    })
    .help('help')
    .count('verbose');

const { argv } = yargs;

if (!argv.input && !argv.daemon) {
    yargs.showHelp();
    process.exit();
}

if (!argv.hostname) {
    argv.hostname = os.hostname();
}

if (!argv.platform) {
    argv.platform = platform;
}

if (!~platforms.available.indexOf(argv.platform)) {
    yargs.showHelp();
    console.log(`"${argv.platform}" platform is not available`);
    process.exit();
}

argv.home = path.resolve(argv.home);

if (!argv.hook || !fs.existsSync(argv.hook)) {
    if (fs.existsSync(path.normalize(`${argv.home}/hook`))) {
        argv.hook = path.normalize(`${argv.home}/hook`);
    }
}

const levelOption = argv.v | 0;
if (levelOption > 0) {
    process.env.DEBUG = (process.env.DEBUG ? (['beaver:*'].concat(process.env.DEBUG.split(','))).join(',') : 'beaver:*');
}

module.exports = argv;
