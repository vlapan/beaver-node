const ip = require('ip');
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
        config.parser.locations.list.forEach((location) => {
            if (location.wan3) {
                ns.push({
                    host: `${location.name}.`,
                    ip: location.wan3,
                });
            } else {
                location.routers.list.forEach((router) => {
                    if (router.router === 'active') {
                        ns.push({
                            host: `${router.key}.`,
                            ip: location.wan3,
                        });
                    }
                });
            }
        });


        const domains = [];
        for (const [domainKey, domain] of Object.entries(config.routing.domains)) {
            domain.key = domainKey.replace(/^./, '');
            if (domain.publish === true) {
                domains.push(domain);
            }
        }

        if (!domains.length) {
            if (typeof callback === 'function') {
                callback('No domains provided.');
            }
            return;
        }

        function toAKey(fqdn) {
            let zone = fqdn;
            for (const domain of domains) {
                const re = new RegExp(`.${domain.key}$`, '');
                zone = zone.replace(re, '');
            }
            return zone;
        }

        function byAKey(object) {
            const result = {};
            for (const [key, value] of Object.entries(object)) {
                const aKey = toAKey(key);
                let inner = result[aKey];
                if (typeof inner !== 'object') {
                    inner = {};
                    result[aKey] = inner;
                }
                inner[key] = value;
            }
            return result;
        }

        function sorter(a, b) {
            const an = (a.name || a.host).replace(/^\*\./, '');
            const bn = (b.name || b.host).replace(/^\*\./, '');
            if ((an === '*' || an === '@') && bn !== '*') {
                return -1;
            } else if ((bn === '*' || bn === '@') && an !== '*') {
                return 1;
            }
            if (an < bn) {
                return -1;
            } else if (an > bn) {
                return 1;
            }
            if (a.ip && b.ip && ip.isV4Format(a.ip) && ip.isV4Format(b.ip)) {
                return ip.toLong(a.ip) - ip.toLong(b.ip);
            }
            return 0;
        }

        function transformByDomain(domain, data) {
            const re = new RegExp(`.${domain.key}$`, '');
            const result = {};
            for (const [aKey, targets] of Object.entries(data)) {
                let current;
                for (const [key, target] of Object.entries(targets)) {
                    if (re.test(key)) {
                        current = {};
                        current[key] = target;
                        break;
                    } else if (!current || aKey === key) {
                        current = {};
                        current[key] = target;
                    }
                }
                if (current) {
                    for (const [key, item] of Object.entries(current)) {
                        result[key] = item;
                    }
                }
            }
            return result;
        }

        for (const domain of domains) {
            if (domain.mode === 'infrastructure') {
                const targets = config.parser.targetListDns;
                domain.targets = transformByDomain(domain, byAKey(targets));
            }
        }

        const hostLocation = config.parser.location;
        const hostExternal = hostLocation.wan3;
        const myIp = hostExternal || config.parser.router.wan3;

        function add(route, domain, entriesMap, entriesLocalMap) {
            const targetTargets = route.endpointsList;
            const dnsType = route && route.modeDns;

            let targets = [];
            let targetsLocal = [];

            if (dnsType === 'static') {
                return;
            }

            if (dnsType === 'use-router') {
                for (const target of targetTargets) {
                    if (target.location) {
                        targets = targets.concat(target.location.wan3smart);
                        targetsLocal = targetsLocal.concat(target.location.wan3smart);
                    } else {
                        targets = targets.concat(config.parser.wan3smart);
                        targetsLocal = targetsLocal.concat(config.parser.wan3smart);
                    }
                }
            } else {
                let skipLocal = false;
                for (const target of targetTargets) {
                    if (target.TargetStatic) {
                        if (myIp) {
                            targets = targets.concat(myIp);
                            targetsLocal = targetsLocal.concat(myIp);
                        }
                        continue;
                    }

                    const sameLocation = target.location === hostLocation;
                    if (sameLocation && dnsType === 'remote' || !sameLocation && dnsType === 'local') {
                        continue;
                    } else if (dnsType === 'direct') {
                        if (target.wan3) {
                            targets.push(target.wan3);
                        }
                        if (route.hasLocalEndpoints && sameLocation) {
                            targetsLocal.push(target.lan3);
                        } else if (!route.hasLocalEndpoints && target.wan3) {
                            targetsLocal.push(target.wan3);
                        }
                        continue;
                    }

                    const localRoute = sameLocation && target.lan3;
                    if (localRoute && !skipLocal) {
                        if (targetTargets.length === 1) {
                            targetsLocal = [target.lan3];
                        } else {
                            targetsLocal.push(target.lan3);
                            if (dnsType !== 'use-wan') {
                                targetsLocal = [];
                                const external = target.location.wan3;
                                if (external) {
                                    [].concat(external).forEach((item) => {
                                        targetsLocal.push(item);
                                    });
                                }
                                skipLocal = true;
                            }
                        }
                    }

                    if (target.wan3 && dnsType === 'use-wan') {
                        targets.push(target.wan3);
                        if (!localRoute && !skipLocal) {
                            targetsLocal.push(target.wan3);
                        }
                        continue;
                    }

                    {
                        const location = target.location;
                        const external = location && location.wan3smart;
                        if (external && external.length) {
                            external.forEach((item) => {
                                targets.push(item);
                                if (!localRoute && !skipLocal) {
                                    targetsLocal.push(item);
                                }
                            });
                            continue;
                        }

                        if (target.wan3) {
                            targets.push(target.wan3);
                            if (!localRoute && !skipLocal) {
                                targetsLocal.push(target.wan3);
                            }
                            continue;
                        }
                    }
                }
            }

            const aKey = toAKey(route.key);

            targets.forEach((item) => {
                const targetKey = aKey + item;
                if (entriesMap[targetKey]) {
                    return;
                }
                entriesMap[targetKey] = {
                    name: aKey + '.' + domain.key + '.',
                    ip: item,
                };
            });

            targetsLocal.forEach((item) => {
                const targetKey = aKey + item;
                if (entriesLocalMap[targetKey]) {
                    return;
                }
                entriesLocalMap[targetKey] = {
                    name: aKey + '.' + domain.key + '.',
                    ip: item,
                };
            });
        }

        function generateDomainFile(domain, routePath, entries) {
            fs.openSync(routePath, 'w');

            let data = {
                $origin: `${domain.key}.`,
                $ttl: options.ttl,
                soa: {
                    mname: `${config._hostname}.`,
                    rname: `admin.${domain.key}.`,
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
                data.ns = [];
            }
            if (typeof domain.dns !== 'object' || typeof domain.dns.NS !== 'object' || !domain.dns.NS['@']) {
                Hoek.merge(data.ns, ns);
                const re = new RegExp(`.${domain.key}.$`, '');
                for (const nsItem of ns) {
                    if (re.test(nsItem.host)) {
                        const targetKey = toAKey(nsItem.host.replace(/\.$/, ''));
                        data.a.push({
                            name: `${targetKey}.${domain.key}.`,
                            ip: nsItem.ip,
                        });
                    }
                }
            }
            data.ns.sort(sorter);

            data.a.sort(sorter);

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
            let allowTransferConfig = domain['allow-transfer'];
            let allowTransfer = '';
            if (allowTransferConfig && type === 'global') {
                if (typeof allowTransferConfig === 'string') {
                    allowTransfer = allowTransferConfig;
                } else if (Array.isArray(allowTransferConfig)) {
                    allowTransfer = allowTransferConfig.join(';');
                }
            }

            let result = '';
            result += `zone "${domain.key}" {\n`;
            result += '    type master;\n';
            result += `    file "master/beaver/${type}/${domain.key}.dns";\n`;
            if (allowTransfer) {
                result += `    allow-transfer { ${allowTransfer}; };\n`;
            }
            result += '};';
            return result;
        }

        function printZoneSlaveConf(type, domain) {
            let allowTransferSet = new Set();

            allowTransferSet.add('127.0.0.1');

            config.parser.routers.list.forEach((item) => {
                item.wan && item.wan.ip && allowTransferSet.add(item.wan.ip);
                item.lan && item.lan.ip && allowTransferSet.add(item.lan.ip);
            });

            config.parser.locations.list.forEach((item) => {
                item.wan3 && allowTransferSet.add(item.wan3);
                item.lan3 && allowTransferSet.add(item.lan3);
            });

            const allowTransfer = [...allowTransferSet].map((item) => {
                return Array.isArray(item) ? item.join(';') : item;
            }).join(';');

            let result = '';
            result += `zone "${domain.key}" {\n`;
            result += '    type slave;\n';
            result += `    file "slave/beaver/${type}/${domain.key}.dns";\n`;
            result += `    masters { ${domain.masters.join(';')}; };\n`;
            result += `    allow-transfer { ${allowTransfer || 'none;'} };\n`;
            result += '};';
            return result;
        }
        for (const domain of domains) {
            if (domain.mode === 'infrastructure') {
                const entriesMap = {};
                const entriesLocalMap = {};
                for (const target of Object.values(domain.targets)) {
                    add(target, domain, entriesMap, entriesLocalMap);
                }
                const entries = Object.values(entriesMap);
                const entriesLocal = Object.values(entriesLocalMap);
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
        }
        fs.writeFileSync(`${zonesPath}/local.conf`, `${zonesConf.local.join('\n')}\n`, 'UTF-8');
        fs.writeFileSync(`${zonesPath}/local_slave.conf`, `${zonesConf.local_slave.join('\n')}\n`, 'UTF-8');
        fs.writeFileSync(`${zonesPath}/global.conf`, `${zonesConf.global.join('\n')}\n`, 'UTF-8');
        fs.writeFileSync(`${zonesPath}/global_slave.conf`, `${zonesConf.global_slave.join('\n')}\n`, 'UTF-8');

        if (typeof callback === 'function') {
            callback(null, true);
        }
    },
};
