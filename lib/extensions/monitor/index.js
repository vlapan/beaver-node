const fs = require('fs');
const path = require('path');
const async = require('async');

const argv = require('../../argv');
const config = require('../../configuration');
const logger = require('../../logger');

function nodeAccessDetail(structure, key, node) {
    var vm = node;
    var dc = structure.locations[vm.location];
    if (!vm.location) {
        return {};
    }
    var location = config.parser.locations.map[vm.location];
    if (!location) {
        return {};
    }
    var wan3 = location.wan3
    var os = structure.kvm.OSes[vm.os || (node.disposition !== 'guest' && ('ubuntu'))];
    var rt = structure.routing.types[vm.type || (node.disposition !== 'guest' && ('unix'))];
    var tcp = [];
    var ssh = [];
    var rdp = [];
    if (vm.wan && vm.wan.ip) {
        if (os && os.ssh) {
            tcp.push({
                ip: vm.wan.ip,
                port: 22,
                subject: "tcp-conn-22: " + key + ", ssh-wan, ip=" + vm.wan.ip,
                notify: vm.notify
            });
            ssh.push("ssh " + vm.wan.ip);
        }
        if (os && os.rdp) {
            tcp.push({
                ip: vm.wan.ip,
                port: 389,
                subject: "tcp-conn-389: " + key + ", rdp-wan, ip=" + vm.wan.ip,
                notify: vm.notify
            });
            rdp.push("rdp://" + vm.wan.ip);
        }
    }
    if (rt && rt.level3["22"] && vm.tcpShift && dc) {
        var port = (Number(vm.tcpShift || 0) + 22);
        var addresses = collectAddressesForKey([], structure, wan3);
        addresses.length || addresses.push({
            ip: wan3,
        });
        addresses.forEach(function (address) {
            tcp.push({
                host: wan3,
                ip: address.wan,
                port: port,
                subject: "tcp-conn-" + port + ": " + key + ", ssh-fwd, ip=" + address.wan,
                notify: vm.notify
            });
        });
        ssh.push("ssh " + wan3 + " -p " + port);
    }
    if (rt && rt.level3["389"] && vm.tcpShift && dc) {
        var port = (Number(vm.tcpShift || 0) + 389);
        var addresses = collectAddressesForKey([], structure, wan3);
        addresses.length || addresses.push({
            ip: wan3
        });
        addresses.forEach(function (address) {
            tcp.push({
                host: wan3,
                ip: address.wan,
                port: port,
                subject: "tcp-conn-" + port + ": " + key + ", rdp-fwd, ip=" + address.wan,
                notify: vm.notify
            });
        });
        rdp.push("rdp://" + wan3 + ":" + port);
    }
    var row = {
        name: key,
        dc: vm.location,
        resources: vm.resources,
        lan: vm.lan,
        wan: vm.wan,
        vpn: vm.vpn,
        grp: vm.vpn && vm.vpn.key || undefined,
        os: vm.os
    };
    tcp.length && Object.defineProperty(row, "monitor", {
        value: {
            tcp: tcp
        },
        enumerable: false
    });
    ssh.length && Object.defineProperty(row, "ssh", {
        value: ssh,
        enumerable: false
    });
    rdp.length && Object.defineProperty(row, "rdp", {
        value: rdp,
        enumerable: false
    });
    return row;
}

function prepareAllRouters(structure) {
    // cache
    var allRouters = structure.allRouters;
    if (allRouters) {
        return allRouters;
    }
    allRouters = [];

    function forRouter(key, node) {
        if (node.router === 'active' && node.wan && node.wan.ip) {
            allRouters.push({
                host: key,
                location: node.location,
                wan: node.wan.ip
            });
        }
    }

    Object.keys(structure.servers).forEach(function (key) {
        var node = structure.servers[key];
        forRouter(key, node);
    });

    Object.defineProperty(structure, "allRouters", {
        value: allRouters
    });
    return allRouters;
}

function collectAddressesForKey(result, structure, key) {
    function forNode(key, node, result) {
        if (!node.wan || !node.wan.ip) {
            prepareAllRouters(structure).forEach(function (router) {
                if (node.location !== router.location) {
                    return;
                }
                result.push({
                    host: key,
                    location: router.location,
                    wan: router.wan,
                    lan: node.lan && node.lan.ip || router.lan
                });
            });
            return result;
        }
        result.push({
            host: key,
            location: node.location,
            wan: node.wan.ip,
            lan: node.lan && node.lan.ip || undefined
        });
        return result;
    }

    var antiOverflow = {};

    function forRoute(key, route, result) {
        var target = route.target;
        if (!target || target.indexOf('://') !== -1) {
            return result;
        }
        (Array.isArray(target) ? target : [target]).forEach(function (keyOther) {
            var map = antiOverflow[key] || (antiOverflow[key] = {});
            if (key !== keyOther && !map[keyOther]) {
                var route = config.parser.targets.source[keyOther];
                if (route) {
                    map[keyOther] = true;
                    return forRoute(key, route, result);
                }
            }
            var node = structure.servers[keyOther];
            if (node) {
                return forNode(key, node, result);
            }
        });

        return result;
    }

    var route = config.parser.targets.source[key];
    if (route) {
        return forRoute(key, route, result);
    }
    var node = structure.servers[key];
    if (node) {
        return forNode(key, node, result);
    }
    return result;
}

function prepareStructure(structure) {
    var result = {
        os: {},
        dc: {},
        vm: {}
    };
    Object.keys(structure.locations).forEach(function (key) {
        var dc = structure.locations[key];
        var row = {
            name: dc.name,
            title: dc.title,
            ext: dc.ext
        };
        result.dc[key] = row;
    });
    Object.keys(structure.kvm.OSes).forEach(function (key) {
        var os = structure.kvm.OSes[key];
        var row = {
            name: key,
            description: os.title
        };
        result.os[key] = row;
    });
    Object.keys(structure.servers).sort().forEach(function (key) {
        var row = nodeAccessDetail(structure, key, structure.servers[key]);
        result.vm[key] = row;
    });
    return result;
}

function listMON(structure) {
    var tcp = [];
    var web = [];

    var hosts = structure.servers;

    Object.keys(hosts).forEach(function (key) {
        var host = hosts[key];
        if (!host || !host.notify) {
            return;
        }
        host.lan && host.lan.ip && tcp.push({
            host: key,
            ip: host.lan.ip,
            port: 22,
            subject: "tcp-conn-22: " + key + ", ssh-lan, ip=" + host.lan.ip,
            notify: host.notify
        });
        host.wan && host.wan.ip && tcp.push({
            host: key,
            ip: host.wan.ip,
            port: 22,
            subject: "tcp-conn-22: " + key + ", ssh-wan, ip=" + host.wan.ip,
            notify: host.notify
        });
    });

    var vms = prepareStructure(structure);

    Object.keys(vms.vm).forEach(function (key) {
        var vm = vms.vm[key].monitor;
        vm && vm.tcp && vm.tcp.forEach(function (x) {
            x.notify && tcp.push(x);
        });
        vm && vm.web && vm.web.forEach(function (x) {
            x.notify && web.push(x);
        });
    });

    Object.keys(config.parser.targets.source).forEach(function (key) {
        var route = config.parser.targets.source[key];
        var monitor = route.monitor;
        if (!monitor || !monitor.notify) {
            return;
        }
        var expect = Number(monitor.expectCode || 200);
        var url = monitor.url;
        if (url) {
            web.push({
                url: url,
                expectCode: expect,
                subject: "web-get-" + expect + ": " + key + ", " + url,
                notify: monitor.notify
            });
        } else {
            url = (route.name || key);
            var addresses = collectAddressesForKey([], structure, route.name || key);
            addresses.length || addresses.push({
                wan: key,
                lan: key
            });
            var localLocation = false;
            for (var i = 0, till = addresses.length; i < till; i++) {
                var address = addresses[i];
                if (address.location === config._hostConfig.location) {
                    localLocation = true;
                    break;
                }
            }
            addresses.forEach(function (address) {
                if (localLocation && address.location !== config._hostConfig.location || !address.lan) {
                    return;
                }
                var ip = localLocation ? address.lan : address.wan;

                var httpPort = localLocation && config.routing.types[address.type || 'unix'].level6['plain'] | 0;
                if (httpPort === 80) {
                    httpPort = undefined;
                }
                web.push({
                    url: "http://" + url + (httpPort ? ':' + httpPort : '') + '/',
                    ip: ip,
                    port: httpPort,
                    expectCode: expect,
                    subject: "web-get-" + expect + ": http://" + url + (httpPort ? ':' + httpPort : '') + "/, ip=" + ip,
                    notify: monitor.notify
                });

                var httpsPort = localLocation && config.routing.types[address.type || 'unix'].level6['secure'] | 0;
                if (httpsPort === 443) {
                    httpsPort = undefined;
                }
                if (httpsPort !== 80) {
                    web.push({
                        url: "https://" + url + (httpsPort ? ':' + httpsPort : '') + '/',
                        ip: ip,
                        port: httpsPort,
                        expectCode: expect,
                        subject: "web-get-" + expect + ": https://" + url + (httpsPort ? ':' + httpsPort : '') + "/, ip=" + ip,
                        notify: monitor.notify
                    });
                }
            });
        }
    });

    tcp.sort(function compare(a, b) {
        return a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : a.ip < b.ip ? -1 : a.ip > b.ip ? 1 : a.port < b.port ? -1 : a.port > b.port ? 1 : 0;
    });

    var filter = {};
    web = web.sort(function compare(a, b) {
        return a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
    }).filter(function (item) {
        if (filter[item.subject]) {
            return false;
        }
        filter[item.subject] = 1;
        return true;
    });

    var result = {
        disabled: !config._hostConfig.monitor,
        testing: config._hostConfig.monitor === 'testing',
        interval: structure.monitoring.settings ? structure.monitoring.settings.intervalMillis | 0 : 600000,
        tcpTimeout: structure.monitoring.tests ? structure.monitoring.tests.tcp.timeoutMillis | 0 : 5000,
        webTimeout: structure.monitoring.tests ? structure.monitoring.tests.web.timeoutMillis | 0 : 10000,
        notify: structure.monitoring.notify,
        tcp: tcp,
        web: web
    };

    return result;
}

module.exports = {
    generate: (callback) => {
        logger.banner('Monitor configuration generation');

        if (!config.monitoring) {
            return callback(null, true);
        }

        const monitorConfig = listMON(config);
        const monitorConfigPath = path.resolve(`${config._outputPath}/monitor.json`);

        logger.log('info', `config path: ${monitorConfigPath}`);
        logger.log('info', `host monitoring: ${monitorConfig.disabled ? 'disabled' : 'enabled'}`);

        async.series([
            (cb) => {
                fs.writeFile(monitorConfigPath, JSON.stringify(monitorConfig, null, 4), (err) => {
                    cb(err, true);
                });
            },
            (cb) => {
                const monitorConfigHomePath = `${argv.home}/monitor.json`;
                if (monitorConfigPath === monitorConfigHomePath) {
                    cb(null, true);
                    return;
                }
                logger.log('info', `copy config from ${monitorConfigPath} to ${monitorConfigHomePath}`);
                fs.copyFile(monitorConfigPath, monitorConfigHomePath, (err) => {
                    if (err) {
                        logger.error(`copy error: ${err}`);
                    }
                    cb(err, true);
                });
            }
        ], (err, result) => {
            if (callback) {
                callback(err, true);
            }
        });
    }
};
