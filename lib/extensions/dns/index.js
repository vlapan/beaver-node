const fs = require('fs');
const path = require('path');

const config = require(`${__dirname}/../../configuration`);
const logger = require(`${__dirname}/../../logger`);

const zonefile = require('dns-zonefile');

module.exports = {
    generate(callback) {
        logger.banner('DNS configuration generation');

        const options = config.routing.options && typeof config.routing.options.dns === 'object' ? config.routing.options.dns : {};
        options.ttl && (options.ttl |= 0);
        options.ttl || (options.ttl = 2400);
        options.refresh && (options.refresh |= 0);
        options.refresh || (options.refresh = 900);
        options.retry && (options.retry |= 0);
        options.retry || (options.retry = 300);
        options.expire && (options.expire |= 0);
        options.expire || (options.expire = 86400);
        options.minimum && (options.minimum |= 0);
        options.minimum || (options.minimum = 2400);

        const zonesPath = path.normalize(`${config._outputPath}/dns`);
        if (!fs.existsSync(zonesPath)) {
            fs.mkdirSync(zonesPath);
        }

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

        function transform(obj, keys, comment = '') {
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
                        entry[keys.value || 'value'] = item + comment;
                    }
                    entries.push(entry);
                });
            });
            return entries;
        }

        function generateDomainFile(domain, routePath) {
            fs.openSync(routePath, 'w');

            // let zone = '';
            // zone += `; Zone: ${domain.key}\n`;
            // zone += `; Exported: ${new Date()}\n`;
            // logger.log('info', `>>>>>>> +++++++ ${zone}`);

            const lineComment =  '\t; ' + domain.type;

            const data = {
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
                if (typeof domain.dns.NS === 'object') {
                    data.ns = transform(domain.dns.NS, {
                        value: 'host',
                    }, lineComment);
                }
                if (typeof domain.dns.A === 'object') {
                    data.a = transform(domain.dns.A, {
                        value: 'ip',
                    }, lineComment);
                }
                if (typeof domain.dns.AAAA === 'object') {
                    data.aaaa = transform(domain.dns.AAAA, {
                        value: 'ip',
                    }, lineComment);
                }
                if (typeof domain.dns.CNAME === 'object') {
                    data.cname = transform(domain.dns.CNAME, {
                        value: 'alias',
                    }, lineComment);
                }
                if (typeof domain.dns.MX === 'object') {
                    data.mx = transform(domain.dns.MX, {
                        override: (entry, item) => {
                            const arr = item.split(' ');
                            entry.preference = arr.shift();
                            entry.host = arr.join(' ') + lineComment;
                        }
                    });
                }
                if (typeof domain.dns.TXT === 'object') {
                    data.txt = transform(domain.dns.TXT, {
                        value: 'txt',
                    }, lineComment);
                }
                if (typeof domain.dns.CAA === 'object') {
                    data.caa = transform(domain.dns.CAA, {
                        override: (entry, item) => {
                            entry.name = item.name;
                            entry.flags = item.flags;
                            entry.tag = item.tag;
                            entry.value = item.value;
                        }
                    });
                }
            }

            data.a || (data.a = []);
            data.aaaa || (data.aaaa = []);
            data.ns || (data.ns = []);

            const output = zonefile.generate(data);

            fs.writeFileSync(routePath, output, 'UTF-8');
            logger.log('info', `"${routePath}" done`);
        }

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
                if (!lan) {
                    continue;
                }
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
