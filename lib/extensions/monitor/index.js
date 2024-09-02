const fs = require('node:fs/promises');
const path = require('node:path');

const config = require('../../configuration');

const { sortFunc, filterBySubject, protocolToLevel6 } = require('./utils');

function getTcpTest(o) {
    return {
        name: 'tcp-conn',
        type: o.type,
        host: o.host,
        ip: o.ip,
        port: o.port,
        subject: `tcp-conn-${o.type.split('-').shift()}: ${o.host}, ${o.type}, ip=${o.ip}, port=${o.port}`,
        notify: o.notify,
    };
}

function generateTcpTests() {
    const tcp = [];
    const myZone = config.parser.server.location.source.zone ?? '';
    for (const [key, server] of Object.entries(config.parser.servers.map)) {
        const vm = config.servers[key];
        if (!vm.location || !vm.notify) {
            continue;
        }

        const location = server.location;
        if (!location) {
            continue;
        }

        const serverZone = location.source.zone ?? '';
        if (myZone !== serverZone) {
            continue;
        }

        const wan3 = location.wan3;
        const os = config.kvm ? config.kvm.OSes[vm.os || (vm.disposition !== 'guest' && ('ubuntu'))] : { ssh: true };
        // const rt = structure.routing.types[vm.type || (vm.disposition !== 'guest' && ('unix'))];
        const level3 = (server.routingType || {}).level3 ?? {};

        const options = {
            host: key,
            notify: vm.notify,
        };

        const sshPort = Number.parseInt(level3['22/tcp'] || level3['22'], 10);
        const rdpPort = Number.parseInt(level3['389/tcp'] || level3['389'], 10);

        if (vm.wan && vm.wan.ip) {
            if (os && os.ssh && sshPort) {
                options.type = 'ssh-wan';
                options.ip = vm.wan.ip;
                options.port = sshPort;
                tcp.push(getTcpTest(options));
            }
            if (os && os.rdp && rdpPort) {
                options.type = 'rdp-wan';
                options.ip = vm.wan.ip;
                options.port = rdpPort;
                tcp.push(getTcpTest(options));
            }
        }

        if (vm.lan && vm.lan.ip) {
            if (sshPort) {
                options.type = 'ssh-lan';
                options.ip = vm.lan.ip;
                options.port = sshPort;
                tcp.push(getTcpTest(options));
            }
            if (rdpPort) {
                options.type = 'rdp-lan';
                options.ip = vm.lan.ip;
                options.port = rdpPort;
                tcp.push(getTcpTest(options));
            }
        }

        if (wan3 && sshPort && server.tcpShift) {
            options.type = 'ssh-fwd';
            options.ip = wan3;
            options.port = (Number(server.tcpShift || 0) + 22);
            tcp.push(getTcpTest(options));
        }

        if (wan3 && rdpPort && server.tcpShift) {
            options.type = 'rdp-fwd';
            options.ip = wan3;
            options.port = (Number(server.tcpShift || 0) + 389);
            tcp.push(getTcpTest(options));
        }
    }
    return tcp.flat();
}

function getWebTest(o) {
    const result = [];
    const path = o.path || '/';
    const host = o.url.toLowerCase().replace(/https?:\/\//, '').split('/').shift();
    for (const protocol of [o.protocols || ''].flat()) {
        const portMapped = Number.parseInt(o?.level6?.[protocolToLevel6[protocol]] || o.port, 10);
        let portNumber = portMapped;
        if (protocol === 'http' && portNumber === 80) {
            portNumber = undefined;
        } else if (protocol === 'https' && portNumber === 443) {
            portNumber = undefined;
        } else if (protocol === 'https' && portNumber === 80) {
            continue;
        }
        const port = portNumber ? `:${portNumber}` : '';
        const url = `${protocol ? `${protocol}://` : ''}${o.url}${port}${path}`;
        result.push({
            name: 'web-get',
            host: host,
            url: url,
            ip: o.ip,
            port: port || undefined,
            expectCode: o.expectCode,
            subject: `web-get-${o.expectCode}: ${url}, ip=${o.ip}`,
            notify: o.notify,
        });
    }
    return result;
}

function generateWebTests() {
    const myZone = config.parser.server.location.source.zone ?? '';
    const protocolsDefault = ['http', 'https'];

    const web = [];

    for (const target of config.parser.targets.list) {
        const source = target.source;
        if (source?.monitor?.notify === undefined) {
            continue;
        }
        const level6 = (target.routingType || {}).level6;
        const monitor = source.monitor;
        const options = {
            expectCode: Number(monitor.expectCode) || 200,
            notify: monitor.notify,
            path: monitor.path,
            level6,
        };
        if (monitor.url && (/https?:\/\//).test(monitor.url)) {
            options.url = monitor.url;
            web.push(getWebTest(options));
        } else if (target.TargetStatic || !target.wan3smart || target.endpointsList.length === 0) {
            options.protocols = monitor.protocol ? [monitor.protocol] : protocolsDefault;
            options.url = source.name || target.key;
            options.ip = target.key;
            web.push(getWebTest(options));
        } else {
            // Zone check
            const endpointsLocations = target.endpointsList.map((x) => x.location).filter((x) => !!x);
            if (endpointsLocations.length > 0) {
                const inZone = endpointsLocations.some((x) => myZone === (x.source.zone ?? ''));
                if (!inZone) {
                    continue;
                }
            }

            options.protocols = monitor.protocol ? [monitor.protocol] : protocolsDefault;
            options.url = source.name || target.key;

            if (monitor?.type === undefined || [monitor.type].flat().includes('location')) {
                const locations = new Set();
                for (const end of target.endpointsList) {
                    locations.add(end.location);
                }
                for (const item of [...locations].map((x) => x.wan3).filter(Boolean)) {
                    options.ip = item;
                    web.push(getWebTest(options));
                }
            }

            if ([monitor.type].flat().includes('server')) {
                for (const end of target.endpointsList) {
                    if (target.hasLocalEndpoints) {
                        if (end.lan3 && end.location === config.parser.location) {
                            options.ip = end.lan3;
                            web.push(getWebTest(options));
                        }
                    } else {
                        if (end.wan3) {
                            options.ip = end.wan3;
                            web.push(getWebTest(options));
                        } else {
                            let atLeastOneActive = false;
                            for (const router of config.parser.routers.list) {
                                if (!router.isActive || !router.wan3 || router.location !== end.location) {
                                    continue;
                                }
                                atLeastOneActive = true;
                                options.ip = router.wan3;
                                web.push(getWebTest(options));
                            }
                            if (atLeastOneActive === false) {
                                web.push(getWebTest({
                                    ...options,
                                    ip: options.url,
                                }));
                            }
                        }
                    }
                }
            }
        }
    }
    return web.flat();
}

function getMonitoring(structure) {
    const tcp = generateTcpTests();
    const web = generateWebTests();

    tcp.sort(sortFunc);
    web.sort(sortFunc);

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
        tcp: filterBySubject(tcp),
        web: filterBySubject(web),
    };
}

module.exports = {
    async generate(o) {
        if (!config.monitoring) {
            return;
        }

        const debug = o.debug.extend('monitor');
        debug('start');

        const monitorConfig = getMonitoring(config);
        const monitorConfigPath = path.resolve(`${config._outputPath}/monitor.json`);

        debug(`tests: tcp=${monitorConfig.tcp.length} web=${monitorConfig.web.length}`);
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
