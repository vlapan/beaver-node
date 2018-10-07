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
        logger.log('info', 'DNS configuration generation');
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

        // console.log(JSON.stringify(config.parser.buildDnsView(null).toSourceObject(), null, 4)); process.exit();

        const domains = [];
        const domainsSource = config.parser.buildDnsView(null).toSourceObject();
        // const domainsSource = config.routing.domains;
        // for (const [domainKey, domain] of Object.entries(config.routing.domains)) {
        for (const [domainKey, domain] of Object.entries(domainsSource)) {
            domain.type = 'global';
            domain.key = domainKey.replace(/^\./, '');
            domain.keySource = domainKey;
            domains.push(domain);
        }

        if (!domains.length) {
            if (typeof callback === 'function') {
                callback(null, 'No domains provided.');
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

        const hostLocation = config.parser.location;
        const hostExternal = hostLocation.wan3;
        const myIp = hostExternal || config.parser.router.wan3;

        function generateDomainFile(domain, routePath) {
            fs.openSync(routePath, 'w');

            const lineComment =  '\t; ' + domain.type;

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
                            if (typeof keys.override === 'function') {
                                keys.override(entry, item);
                            } else {
                                entry[keys.value || 'value'] = item + lineComment;
                            }
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
                        override: function (entry, item) {
                            const arr = item.split(' ');
                            entry.preference = arr.shift();
                            entry.host = arr.join(' ') + lineComment;
                        }
                    });
                }
                if (typeof domain.dns.TXT === 'object') {
                    defaults.txt = transform(domain.dns.TXT, {
                        value: 'txt',
                    });
                }
                data = Hoek.merge(defaults, data);
            }

            data.a || (data.a = []);
            data.aaaa || (data.aaaa = []);
            data.ns || (data.ns = []);

            data.ns.sort(sorter);
            data.a.sort(sorter);
            data.aaaa.sort(sorter);

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
            const allowTransferConfig = domain['allow-transfer'];
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
            result += `    file "${domain.zonePath}";\n`;
            if (allowTransfer) {
                result += `    allow-transfer { ${allowTransfer}; };\n`;
            }
            result += '};';

            return result + '\n';
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
            }).join(';') + ';';

            let result = '';

            result += `zone "${domain.key}" {\n`;
            result += '    type slave;\n';
            result += `    file "${domain.zonePath}";\n`;
            result += `    masters { ${domain.masters.join(';')}; };\n`;
            result += `    allow-transfer { ${allowTransfer || 'none;'} };\n`;
            result += '};';

            return result;
        }


        let viewResult = '';

        // LOCAL VIEWS
        {
            const lans = (config.parser.location.lans||{}).list || [config.parser.location.lans];
            for (const lan of lans) {
                const lanKey = lan.key;
                const viewKey = 'local-' + lanKey;

                const zonesLocalPath = path.normalize(`${config._outputPath}/dns/${viewKey}`);
                if (!fs.existsSync(zonesLocalPath)) {
                    fs.mkdirSync(zonesLocalPath);
                }

                viewResult += `view ${viewKey} {\n`;
                viewResult += `    match-clients { ${lan.networkCidr}; };\n`;
                viewResult += '    recursion yes;\n';
                viewResult += '    include "/usr/local/etc/namedb/default.zones";\n';
                viewResult += '\n';

                const viewSource = config.parser.buildDnsView(lan).toSourceObject();
                for (const [domainKey, domain] of Object.entries(viewSource)) {
                    domain.key = domainKey.replace(/^./, '');
                    domain.type = viewKey;
                    if (domain.mode === 'static') {
                        domain.zonePath = `master/beaver/${viewKey}/${domain.key}.dns`;
                        generateDomainFile(domain, path.normalize(`${zonesLocalPath}/${domain.key}.dns`));
                        const zoneConf = printZoneMasterConf('local', domain);
                        viewResult += '    ' + zoneConf.split('\n').join('\n    ') + '\n';
                    } else if (domain.mode === 'slave') {
                        domain.zonePath = `slave/beaver/${viewKey}/${domain.key}.dns`;
                        const zoneConf = printZoneSlaveConf('local', domain);
                        viewResult += '    ' + zoneConf.split('\n').join('\n    ') + '\n';
                    }
                }

                viewResult += '};\n';
            }
        }

        // GLOBAL VIEW
        {
            const viewKey = 'global';

            const zonesGlobalPath = path.normalize(`${config._outputPath}/dns/${viewKey}`);
            if (!fs.existsSync(zonesGlobalPath)) {
                fs.mkdirSync(zonesGlobalPath);
            }

            viewResult += `view ${viewKey} {\n`;
            viewResult += `    match-clients { "any"; };\n`;
            viewResult += '    recursion no;\n';
            viewResult += '    include "/usr/local/etc/namedb/default.zones";\n';
            viewResult += '\n';

            for (const domain of domains) {
                if (domain.mode === 'static') {
                    domain.zonePath = `master/beaver/${viewKey}/${domain.key}.dns`;
                    generateDomainFile(domain, path.normalize(`${zonesGlobalPath}/${domain.key}.dns`));
                    const zoneConf = printZoneMasterConf('global', domain);
                    viewResult += '    ' + zoneConf.split('\n').join('\n    ') + '\n';
                } else if (domain.mode === 'dedicated') {
                    domain.zonePath = `master/beaver/${viewKey}/${domain.key}.dns`;
                    generateDomainFile(domain, path.normalize(`${zonesGlobalPath}/${domain.key}.dns`));
                    const zoneConf = printZoneMasterConf('global', domain);
                    viewResult += '    ' + zoneConf.split('\n').join('\n    ') + '\n';
                } else if (domain.mode === 'slave') {
                    domain.zonePath = `slave/beaver/${viewKey}/${domain.key}.dns`;
                    const zoneConf = printZoneSlaveConf('global', domain);
                    viewResult += '    ' + zoneConf.split('\n').join('\n    ') + '\n';
                }
            }

            viewResult += '};\n';
        }

        fs.writeFileSync(`${zonesPath}/default.conf`, viewResult, 'UTF-8');

        if (typeof callback === 'function') {
            callback(null, true);
        }
    },
};
