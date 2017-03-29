const fs = require('fs');
const path = require('path');

const Hoek = require('hoek');

const config = require(`${__dirname}/../../configuration`);
const logger = require(`${__dirname}/../../logger`);

const zonefile = require('dns-zonefile');

module.exports = {
    generate(callback) {
        logger.log('info', '======================================================================');
        logger.log('info', 'DNS configutation generation');
        logger.log('info', '----------------------------------------------------------------------');

        const options = config.routing.options && typeof config.routing.options.dns === 'object' ? config.routing.options.dns : {};
        if (options.ttl) {
            options.ttl |= 0;
        }
        if (!options.ttl) {
            options.ttl = 2400;
        }
        if (options.refresh) {
            options.refresh |= 0;
        }
        if (!options.refresh) {
            options.refresh = 900;
        }
        if (options.retry) {
            options.retry |= 0;
        }
        if (!options.retry) {
            options.retry = 300;
        }
        if (options.expire) {
            options.expire |= 0;
        }
        if (!options.expire) {
            options.expire = 86400;
        }
        if (options.minimum) {
            options.minimum |= 0;
        }
        if (!options.minimum) {
            options.minimum = 2400;
        }

        const zonesPath = path.normalize(`${config._outputPath}/dns`);
        if (!fs.existsSync(zonesPath)) {
            fs.mkdirSync(zonesPath);
        }
        const zonesGlobalPath = path.normalize(`${config._outputPath}/dns/global`);
        if (!fs.existsSync(zonesGlobalPath)) {
            fs.mkdirSync(zonesGlobalPath);
        }
        const zonesLocalPath = path.normalize(`${config._outputPath}/dns/local`);
        if (!fs.existsSync(zonesLocalPath)) {
            fs.mkdirSync(zonesLocalPath);
        }

        const ns = [];
        const routers = [];
        config._routers.forEach((router) => {
            if (router.router === 'active') {
                ns.push({
                    host: `${router.key}.`,
                });
                routers.push(router);
            }
        });

        const domains = [];
        Object.keys(config.routing.domains).forEach((domainKey) => {
            const domain = config.routing.domains[domainKey];
            if (!domain.publish || domain.publish !== true) {
                return;
            }
            domain.key = domainKey.replace(/^./, '');
            domains.push(domain);
        });

        if (!domains.length) {
            callback && callback('No domains provided.');
            return;
        }

        const entriesMap = {};
        const entriesLocalMap = {};

        const hostLocation = config.locations[config._hostConfig.location];
        const hostExternal = hostLocation.routing.external;
        const myIp = hostExternal || config._hostConfig.wan && config._hostConfig.wan.ip;

        function add(type, key) {
            const dnsType = config.routing.routes[key] && config.routing.routes[key].dns;
            let zone = key;
            domains.forEach((domain) => {
                const re = new RegExp(`.${domain.key}$`, '');
                zone = zone.replace(re, '');
            });

            const item = [].concat(config[type][key]);
            let targets = [];
            let targetsLocal = [];

            let skipLocal = false;
            for (let i = 0, till = item.length; i < till; i++) {
                var target = item[i];

                if (myIp && typeof target !== 'object') {
                    targets = targets.concat(myIp);
                    targetsLocal = targetsLocal.concat(myIp);
                    continue;
                }

                const sameLocation = typeof target === 'object' && target.location === config._hostConfig.location;
                if (sameLocation && dnsType === 'remote' || !sameLocation && dnsType === 'local') {
                    continue;
                }

                var localRoute = sameLocation && target.lan;
                if (localRoute && !skipLocal) {
                    if (item.length === 1) {
                        targetsLocal = [target.lan.ip];
                    } else {
                        targetsLocal.push(target.lan.ip);
                        if (dnsType !== 'use-wan') {
                            targetsLocal = [];
                            var location = config.locations[target.location];
                            var external = location.routing.external;
                            if (external) {
                                [].concat(external).forEach((item) => {
                                    targetsLocal.push(item);
                                });
                            }
                            skipLocal = true;
                        }
                    }
                }

                if (target.wan && (!config.routing.routes[key] || dnsType === 'use-wan')) {
                    targets.push(target.wan.ip);
                    if (!localRoute && !skipLocal) {
                        targetsLocal.push(target.wan.ip);
                    }
                } else {
                    const empty = !targetsLocal.length;
                    var location = config.locations[target.location];
                    var external = location && location.routing.external;
                    if (external) {
                        [].concat(external).forEach((item) => {
                            targets.push(item);
                            if (!localRoute && !skipLocal) {
                                targetsLocal.push(item);
                            }
                        });
                        continue;
                    }
                    routers.filter(router => router.location === target.location).forEach((router) => {
                        targets.push(router.wan.ip);
                        if (!localRoute && !skipLocal) {
                            targetsLocal.push(router.wan.ip);
                        }
                    });
                }
            }

            targets.forEach((item) => {
                entriesMap[zone + item] = {
                    name: zone,
                    ip: item,
                };
            });

            targetsLocal.forEach((item) => {
                entriesLocalMap[zone + item] = {
                    name: zone,
                    ip: item,
                };
            });
        }

        Object.keys(config._routes).forEach(add.bind(null, '_routes'));

		// var localRoutes = Hoek.clone(entriesLocal);

        Object.keys(config.servers).forEach(add.bind(null, 'servers'));

        const entries = Object.values(entriesMap);
        const entriesLocal = Object.values(entriesLocalMap);

        function generateDomainFile(domain, routePath, entries) {
            fs.openSync(routePath, 'w');

            let data = {
                $origin: `${domain.key}.`,
                $ttl: options.ttl,
                soa: {
                    mname: `${domain.key}.`,
                    rname: `${domain.key}.`,
                    serial: '{time}',
                    refresh: options.refresh,
                    retry: options.retry,
                    expire: options.expire,
                    minimum: options.minimum,
                },
            };
            if (typeof domain.dns === 'object') {
                function transform(obj, keys) {
                    const entries = [];
                    Object.keys(obj).forEach((key) => {
                        let value = obj[key];
                        if (typeof value === 'string') {
                            value = [value];
                        }
                        value.forEach((item) => {
                            const entry = {};
                            entry[keys.key || 'name'] = key;
                            entry[keys.value || 'value'] = item;
                            entries.push(entry);
                        });
                    });
                    return entries;
                }
                const defaults = {};
                if (typeof domain.dns.NS === 'object') {
                    defaults.ns = transform(domain.dns.NS, {
                        value: 'host',
                    });
                }
                if (typeof domain.dns.A === 'object') {
                    defaults.a = transform(domain.dns.A, {
                        value: 'ip',
                    });
                }
                if (typeof domain.dns.AAAA === 'object') {
                    defaults.aaaa = transform(domain.dns.AAAA, {
                        value: 'ip',
                    });
                }
                if (typeof domain.dns.CNAME === 'object') {
                    defaults.cname = transform(domain.dns.CNAME, {
                        value: 'alias',
                    });
                }
                if (typeof domain.dns.MX === 'object') {
                    defaults.mx = transform(domain.dns.MX, {
                        key: 'preference',
                        value: 'host',
                    });
                }
                if (typeof domain.dns.TXT === 'object') {
                    defaults.txt = transform(domain.dns.TXT, {
                        value: 'txt',
                    });
                }
                data = Hoek.merge(defaults, data);
            }
            if (!data.a) {
                data.a = [];
            }
            [].concat(myIp).forEach((item) => {
                if (typeof domain.dns !== 'object' || typeof domain.dns.A !== 'object' || !domain.dns.A['@']) {
                    data.a.push({
                        name: '@',
                        ip: item,
                    });
                }
                if (typeof domain.dns !== 'object' || typeof domain.dns.A !== 'object' || !domain.dns.A['*']) {
                    data.a.push({
                        name: '*',
                        ip: item,
                    });
                }
            });
            if (typeof entries === 'object') {
                data.a = (data.a).concat(entries);
            }
            if (!data.ns) {
                data.ns = ns;
            }
            const output = zonefile.generate(data);

            fs.writeFileSync(routePath, output, 'UTF-8');
            logger.log('info', `"${routePath}" done`);
        }

        const zonesConf = {
            local: [],
            local_slave: [],
            global: [],
            global_slave: [],
        };
        function printZoneMasterConf(type, domain) {
            let result = '';
            result += `zone "${domain.key}" {\n`;
            result += '    type master;\n';
            result += `    file "master/beaver/${type}/${domain.key}.dns";\n`;
            result += '};';
            return result;
        }
        function printZoneSlaveConf(type, domain) {
            let result = '';
            result += `zone "${domain.key}" {\n`;
            result += '    type slave;\n';
            result += `    file "slave/beaver/${type}/${domain.key}.dns";\n`;
            result += `    masters { ${domain.masters.join(';')}; };\n`;
            result += `    allow-transfer { ${routers.map(item => item.lan.ip).concat(routers.map(item => item.wan.ip)).join(';')}; };\n`;
            result += '};';
            return result;
        }
        domains.forEach((domain) => {
            if (domain.mode === 'infrastructure') {
                generateDomainFile(domain, path.normalize(`${zonesGlobalPath}/${domain.key}.dns`), entries);
                zonesConf.global.push(printZoneMasterConf('global', domain));
                generateDomainFile(domain, path.normalize(`${zonesLocalPath}/${domain.key}.dns`), entriesLocal);
                zonesConf.local.push(printZoneMasterConf('local', domain));
            } else if (domain.mode === 'dedicated') {
                generateDomainFile(domain, path.normalize(`${zonesGlobalPath}/${domain.key}.dns`));
                zonesConf.local.push(printZoneMasterConf('global', domain));
            } else if (domain.mode === 'slave') {
                zonesConf.local_slave.push(printZoneSlaveConf('local', domain));
                zonesConf.global_slave.push(printZoneSlaveConf('global', domain));
            }
        });
        fs.writeFileSync(`${zonesPath}/local.conf`, `${zonesConf.local.join('\n')}\n`, 'UTF-8');
        fs.writeFileSync(`${zonesPath}/local_slave.conf`, `${zonesConf.local_slave.join('\n')}\n`, 'UTF-8');
        fs.writeFileSync(`${zonesPath}/global.conf`, `${zonesConf.global.join('\n')}\n`, 'UTF-8');
        fs.writeFileSync(`${zonesPath}/global_slave.conf`, `${zonesConf.global_slave.join('\n')}\n`, 'UTF-8');

        // var localRoutesGrouped = [];
        // for (var i = 0, till = localRoutes.length; i < till; i++) {
        // 	var entry = localRoutes[i];
        // 	var group = localRoutesGrouped[entry.name];
        // 	if (!group) {
        // 		localRoutesGrouped[entry.name] = [entry.ip];
        // 	} else {
        // 		group.push(entry.ip);
        // 	}
        // }

        // function generateRouteFile(key, addresses) {
        // 	var routePath = path.normalize(zonesLocalPath + '/' + key + '.dns');
        // 	fs.openSync(routePath, 'w');

        // 	var a = [];
        // 	addresses.forEach(function (address) {
        // 		a.push({
        // 			name: '@',
        // 			ip: address
        // 		});
        // 		a.push({
        // 			name: '*',
        // 			ip: address
        // 		});
        // 	});

        // 	var output = zonefile.generate({
        // 		$origin: key + '.',
        // 		$ttl: options.ttl,
        // 		soa: {
        // 			mname: key + '.',
        // 			rname: key + '.',
        // 			serial: '{time}',
        // 			refresh: options.refresh,
        // 			retry: options.retry,
        // 			expire: options.expire,
        // 			minimum: options.minimum
        // 		},
        // 		ns: ns,
        // 		a: a
        // 	});

        // 	fs.writeFileSync(routePath, output, 'UTF-8');
        // 	logger.log('info', '"' + routePath + '" done');
        // }

        // Object.keys(localRoutesGrouped).forEach(function (key) {
        // 	generateRouteFile(key, localRoutesGrouped[key]);
        // });

        if (typeof callback === 'function') {
            callback(null, true);
        }
    },
};
