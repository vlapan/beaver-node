const fs = require('node:fs/promises');
const path = require('node:path');

const config = require('../../configuration');

function nodeAccessDetail(structure, key, node) {
    const vm = node;
    if (!vm.location || !vm.notify) {
        return {};
    }
    const location = config.parser.locations.map[vm.location];
    if (!location) {
        return {};
    }
    const wan3 = location.wan3;
    const os = structure.kvm ? structure.kvm.OSes[vm.os || (node.disposition !== 'guest' && ('ubuntu'))] : { ssh: true };

    // const rt = structure.routing.types[vm.type || (node.disposition !== 'guest' && ('unix'))];
    const server = config.parser.servers.map[key];
    const level3 = (server.routingType || {}).level3 ?? {};

    const tcp = [];
    const ssh = [];
    const rdp = [];
    if (vm.wan && vm.wan.ip) {
        if (os && os.ssh) {
            const port = Number.parseInt(level3['22/tcp'], 10) || 22;
            tcp.push({
                ip: vm.wan.ip,
                port: port,
                subject: `tcp-conn-${port}: ${key}, ssh-wan, ip=${vm.wan.ip}`,
                notify: vm.notify,
            });
            ssh.push(`ssh ${vm.wan.ip}`);
        }
        if (os && os.rdp) {
            const port = Number.parseInt(level3['389/tcp'], 10) || 22;
            tcp.push({
                ip: vm.wan.ip,
                port: port,
                subject: `tcp-conn-${port}: ${key}, rdp-wan, ip=' + ${vm.wan.ip}`,
                notify: vm.notify,
            });
            rdp.push(`rdp://${vm.wan.ip}`);
        }
    }
    if (vm.lan && vm.lan.ip) {
        const port = Number.parseInt(level3['22/tcp'], 10) || 22;
        tcp.push({
            ip: vm.lan.ip,
            port: port,
            subject: `tcp-conn-${port}: ${key}, ssh-lan, ip=${vm.lan.ip}`,
            notify: vm.notify,
        });
        ssh.push(`ssh ${vm.lan.ip}`);
    }
    if (level3 && level3['22/tcp'] && server.tcpShift) {
        const port = (Number(server.tcpShift || 0) + 22);
        tcp.push({
            ip: wan3,
            port: port,
            subject: `tcp-conn-${port}: ${key}, ssh-fwd, ip=${wan3}`,
            notify: vm.notify,
        });
        ssh.push(`ssh ${wan3} -p ${port}`);
    }
    if (level3 && level3['389/tcp'] && server.tcpShift) {
        const port = (Number(server.tcpShift || 0) + 389);
        tcp.push({
            ip: wan3,
            port: port,
            subject: `tcp-conn-${port}: ${key}, rdp-fwd, ip=${wan3}`,
            notify: vm.notify,
        });
        rdp.push(`rdp://${wan3}:${port}`);
    }
    const row = {
        name: key,
        dc: vm.location,
        resources: vm.resources,
        lan: vm.lan,
        wan: vm.wan,
        vpn: vm.vpn,
        grp: (vm.vpn && vm.vpn.key) || undefined,
        os: vm.os,
    };
    if (tcp.length > 0) {
        Object.defineProperty(row, 'monitor', {
            value: {
                tcp: tcp,
            },
            enumerable: false,
        });
    }
    if (ssh.length > 0) {
        Object.defineProperty(row, 'ssh', {
            value: ssh,
            enumerable: false,
        });
    }
    if (rdp.length > 0) {
        Object.defineProperty(row, 'rdp', {
            value: rdp,
            enumerable: false,
        });
    }
    return row;
}

function prepareAllRouters(structure) {
    // cache
    let allRouters = structure.allRouters;
    if (allRouters) {
        return allRouters;
    }
    allRouters = [];

    function forRouter(key, node) {
        if (node.router === 'active' && node.wan && node.wan.ip) {
            allRouters.push({
                host: key,
                location: node.location,
                wan: node.wan.ip,
            });
        }
    }

    Object.keys(structure.servers).forEach(function (key) {
        const node = structure.servers[key];
        forRouter(key, node);
    });

    Object.defineProperty(structure, 'allRouters', {
        value: allRouters,
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
                    lan: (node.lan && node.lan.ip) || router.lan,
                });
            });
            return result;
        }
        result.push({
            host: key,
            location: node.location,
            wan: node.wan.ip,
            lan: (node.lan && node.lan.ip) || undefined,
        });
        return result;
    }

    const antiOverflow = {};

    function forRoute(key, route, result) {
        const target = route.target;
        if (!target || target.indexOf('://') !== -1) {
            return result;
        }
        (Array.isArray(target) ? target : [target]).forEach(function (keyOther) {
            const map = antiOverflow[key] || (antiOverflow[key] = {});
            if (key !== keyOther && !map[keyOther]) {
                const route = config.parser.targets.source[keyOther];
                if (route) {
                    map[keyOther] = true;
                    return forRoute(key, route, result);
                }
            }
            const node = structure.servers[keyOther];
            if (node) {
                return forNode(key, node, result);
            }
        });

        return result;
    }

    const route = config.parser.targets.source[key];
    if (route) {
        return forRoute(key, route, result);
    }
    const node = structure.servers[key];
    if (node) {
        return forNode(key, node, result);
    }
    return result;
}

function prepareStructure(structure) {
    const result = {
        os: {},
        dc: {},
        vm: {},
    };
    Object.keys(structure.locations).forEach(function (key) {
        const dc = structure.locations[key];
        const row = {
            name: dc.name,
            title: dc.title,
            ext: dc.ext,
        };
        result.dc[key] = row;
    });
    structure.kvm && Object.keys(structure.kvm.OSes).forEach(function (key) {
        const os = structure.kvm.OSes[key];
        const row = {
            name: key,
            description: os.title,
        };
        result.os[key] = row;
    });
    Object.keys(structure.servers).sort().forEach(function (key) {
        const row = nodeAccessDetail(structure, key, structure.servers[key]);
        result.vm[key] = row;
    });
    return result;
}

function listMON(structure) {
    const tcp = [];
    let web = [];

    const hosts = structure.servers;

    // Object.keys(hosts).forEach(function (key) {
    //     const host = hosts[key];
    //     if (!host || !host.notify) {
    //         return;
    //     }
    //     host.lan && host.lan.ip && tcp.push({
    //         host: key,
    //         ip: host.lan.ip,
    //         port: 22,
    //         subject: 'tcp-conn-22: ' + key + ', ssh-lan, ip=' + host.lan.ip,
    //         notify: host.notify,
    //     });
    //     host.wan && host.wan.ip && tcp.push({
    //         host: key,
    //         ip: host.wan.ip,
    //         port: 22,
    //         subject: 'tcp-conn-22: ' + key + ', ssh-wan, ip=' + host.wan.ip,
    //         notify: host.notify,
    //     });
    // });

    const vms = prepareStructure(structure);

    Object.keys(vms.vm).forEach(function (key) {
        const vm = vms.vm[key].monitor;
        vm && vm.tcp && vm.tcp.forEach(function (x) {
            x.notify && tcp.push(x);
        });
        vm && vm.web && vm.web.forEach(function (x) {
            x.notify && web.push(x);
        });
    });

    for (const [key, target] of Object.entries(config.parser.targets.map)) {
        const route = config.parser.targets.source[key];
        const level6 = (target.routingType || {}).level6;

        const monitor = route.monitor;
        if (!monitor || !monitor.notify) {
            continue;
        }
        const expect = Number(monitor.expectCode || 200);
        let url = monitor.url;
        if (url) {
            web.push({
                url: url + (monitor.path ?? '/'),
                expectCode: expect,
                subject: 'web-get-' + expect + ': ' + key + ', ' + url,
                notify: monitor.notify,
            });
        } else {
            url = (route.name || key);
            const addresses = collectAddressesForKey([], structure, route.name || key);
            if (addresses.length === 0) {
                addresses.push({
                    wan: key,
                    lan: key,
                });
            }
            let localLocation = false;
            for (let i = 0, till = addresses.length; i < till; i++) {
                const address = addresses[i];
                if (address.location === config._hostConfig.location) {
                    localLocation = true;
                    break;
                }
            }
            addresses.forEach(function (address) {
                if ((localLocation && address.location !== config._hostConfig.location) || !address.lan) {
                    return;
                }
                const ip = localLocation ? address.lan : address.wan;

                if (monitor.protocol === undefined || monitor.protocol === 'http') {
                    let httpPort = localLocation && level6 && level6.plain | 0;
                    if (httpPort === 80) {
                        httpPort = undefined;
                    }
                    web.push({
                        url: 'http://' + url + (httpPort ? ':' + httpPort : '') + (monitor.path ?? '/'),
                        ip: ip,
                        port: httpPort,
                        expectCode: expect,
                        subject: 'web-get-' + expect + ': http://' + url + (httpPort ? ':' + httpPort : '') + '/, ip=' + ip,
                        notify: monitor.notify,
                    });
                }

                if (monitor.protocol === undefined || monitor.protocol === 'https') {
                    let httpsPort = localLocation && level6 && level6.secure | 0;
                    if (httpsPort === 443) {
                        httpsPort = undefined;
                    }
                    if (httpsPort !== 80) {
                        web.push({
                            url: 'https://' + url + (httpsPort ? ':' + httpsPort : '') + (monitor.path ?? '/'),
                            ip: ip,
                            port: httpsPort,
                            expectCode: expect,
                            subject: 'web-get-' + expect + ': https://' + url + (httpsPort ? ':' + httpsPort : '') + '/, ip=' + ip,
                            notify: monitor.notify,
                        });
                    }
                }
            });
        }
    }

    tcp.sort((a, b) => {
        return a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : a.ip < b.ip ? -1 : a.ip > b.ip ? 1 : a.port < b.port ? -1 : a.port > b.port ? 1 : 0;
    });

    const filter = {};
    web = web.sort((a, b) => {
        return a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : a.url < b.url ? -1 : a.url > b.url ? 1 : 0;
    }).filter((item) => {
        if (filter[item.subject]) {
            return false;
        }
        filter[item.subject] = 1;
        return true;
    });

    return {
        disabled: !config._hostConfig.monitor,
        testing: config._hostConfig.monitor === 'testing',
        appendReason: structure.monitoring?.settings?.appendReason,
        appendReasonTcp: structure.monitoring?.tests?.tcp?.appendReason,
        appendReasonWeb: structure.monitoring?.tests?.web?.appendReason,
        interval: Number.parseInt(structure.monitoring?.settings?.intervalMillis, 10) || 600000,
        tcpTimeout: Number.parseInt(structure.monitoring?.tests?.tcp?.timeoutMillis, 10) || 5000,
        webTimeout: Number.parseInt(structure.monitoring?.tests?.web?.timeoutMillis, 10) || 10000,
        maxAttempts: Number.parseInt(structure.monitoring?.settings?.maxAttempts, 10) || 2,
        notify: structure.monitoring.notify,
        tcp,
        web,
    };
}

module.exports = {
    async generate(o) {
        if (!config.monitoring) {
            return;
        }

        const debug = o.debug.extend('monitor');
        debug('start');

        const monitorConfig = listMON(config);
        const monitorConfigPath = path.resolve(`${config._outputPath}/monitor.json`);

        debug(`config path: ${monitorConfigPath}`);
        debug(`host monitoring: ${monitorConfig.disabled ? 'disabled' : 'enabled'}`);

        await fs.writeFile(monitorConfigPath, JSON.stringify(monitorConfig, undefined, 4));
        debug('config: done');

        const monitorConfigHomePath = `${o.argv.home}/monitor.json`;
        if (monitorConfigPath !== monitorConfigHomePath) {
            await fs.copyFile(monitorConfigPath, monitorConfigHomePath);
            debug(`config: copy from ${monitorConfigPath} to ${monitorConfigHomePath}: done`);
        }

        debug('done');
    },
};
