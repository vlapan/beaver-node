const fs = require('fs/promises');
const path = require('path');
const zonefile = require('dns-zonefile');

const config = require('../../configuration');

const openssl = require('../../openssl');
const { mkdirSafe, checkFileExists } = require('../../utils/fs');

module.exports = {
    async generate(o) {
        const debug = o.debug.extend('dns');

        debug('start');

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
        await mkdirSafe(zonesPath);
        // console.log(JSON.stringify(config.parser.buildDnsView(null).toSourceObject(), null, 4)); process.exit();

        const domains = [];
        const domainsSource = config.parser.buildDnsView(null);
        for (const domain of domainsSource.list) {
            const obj = domain.toSourceObject();
            obj.source = domain.source;
            obj.type = 'global';
            obj.key = domain.key.replace(/^\./, '');
            obj.keySource = domain.key;
            domains.push(obj);
        }

        if (!domains.length) {
            throw new Error('No domains provided.');
        }

        function transform(obj, keys, comment = '') {
            const entries = [];
            Object.keys(obj).forEach((key) => {
                let value = obj[key];
                if (typeof value === 'string') {
                    value = [value];
                }
                (Array.isArray(value) ? value : [value]).forEach((item) => {
                    const entry = {};
                    entry[keys.key || 'name'] = key;
                    if (typeof keys.override === 'function') {
                        keys.override(entry, item);
                    } else {
                        entry[keys.value || 'value'] = (keys.value === 'txt' && ~item.indexOf(' ') ? `"${item}"` : item) + comment;
                    }
                    entries.push(entry);
                });
            });
            return entries;
        }

        async function generateDomainFile(domain, routePath) {
            const lineComment = '\t; ' + domain.type;

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
                        },
                    });
                }
                if (typeof domain.dns.TXT === 'object') {
                    data.txt = transform(domain.dns.TXT, {
                        value: 'txt',
                    }, lineComment);
                }
                if (typeof domain.dns.SRV === 'object') {
                    data.srv = transform(domain.dns.SRV, {
                        override: (entry, item) => {
                            if (typeof item === 'string') {
                                const s = item.split(' ');
                                entry.name = entry.name.match(/^[0-9]+$/) ? '@' : entry.name;
                                entry.priority = s[0];
                                entry.weight = s[1];
                                entry.port = s[2];
                                entry.target = s[3];
                            } else if (typeof item === 'object') {
                                // entry.name = item.name;
                                if (item.ttl) {
                                    entry.ttl = item.ttl;
                                }
                                entry.priority = item.priority;
                                entry.weight = item.weight;
                                entry.port = item.port;
                                entry.target = item.target;
                            }
                        },
                    });
                }
                if (typeof domain.dns.CAA === 'object') {
                    data.caa = transform(domain.dns.CAA, {
                        override: (entry, item) => {
                            if (typeof item === 'string') {
                                const s = item.split(' ');
                                entry.name = entry.name.match(/^[0-9]+$/) ? '@' : entry.name;
                                entry.flags = s[0];
                                entry.tag = s[1];
                                entry.value = s[2];
                            } else if (typeof item === 'object') {
                                // entry.name = item.name;
                                if (item.ttl) {
                                    entry.ttl = item.ttl;
                                }
                                entry.flags = item.flags;
                                entry.tag = item.tag;
                                entry.value = item.value;
                            }
                        },
                    });
                }
            }

            data.a || (data.a = []);
            data.aaaa || (data.aaaa = []);
            data.ns || (data.ns = []);

            const output = zonefile.generate(data);

            await fs.writeFile(routePath, output);
            debug(`${routePath}: done`);
        }

        function printZoneMasterConf(type, domain) {
            const slaves = domain.slaves || domain.source['allow-transfer'];
            const allowTransferSet = new Set();
            if (slaves && type === 'global') {
                for (const item of (Array.isArray(slaves) ? slaves : [slaves])) {
                    const server = config.parser.servers.map[item];
                    if (server) {
                        const wan3 = server.wan3;
                        if (wan3) {
                            allowTransferSet.add(wan3);
                        }
                        const wan36 = server.wan36;
                        if (wan36) {
                            allowTransferSet.add(wan36);
                        }
                        const lan3 = server.lan3;
                        if (lan3) {
                            allowTransferSet.add(lan3);
                        }
                        continue;
                    }
                    allowTransferSet.add(item);
                }
            }

            const allowTransfer = [...allowTransferSet].map((item) => {
                return Array.isArray(item) ? item.join(';') : item;
            }).join(';');

            let result = '';

            result += `zone "${domain.key}" {\n`;
            result += '    type master;\n';
            result += `    file "${domain.zonePath}";\n`;
            result += `    allow-transfer { ${allowTransfer || 'none'}; };\n`;
            result += '};';

            return result;
        }

        function printZoneSlaveConf(type, domain) {
            const allowTransferSet = new Set();
            const { slaves } = domain;
            if (type === 'global') {
                if (slaves) {
                    for (const item of (Array.isArray(slaves) && slaves || [slaves])) {
                        const server = config.parser.servers.map[item];
                        if (server) {
                            const wan3 = server.wan3;
                            if (wan3) {
                                allowTransferSet.add(wan3);
                            }
                            const wan36 = server.wan36;
                            if (wan36) {
                                allowTransferSet.add(wan36);
                            }
                            const lan3 = server.lan3;
                            if (lan3) {
                                allowTransferSet.add(lan3);
                            }
                            continue;
                        }
                        allowTransferSet.add(item);
                    }
                } else {
                    config.parser.routers.list.forEach((item) => {
                        item.wan && item.wan.ip && allowTransferSet.add(item.wan.ip);
                        item.lan && item.lan.ip && allowTransferSet.add(item.lan.ip);
                    });
                    config.parser.locations.list.forEach((item) => {
                        item.wan3 && allowTransferSet.add(item.wan3);
                        item.lan3 && allowTransferSet.add(item.lan3);
                    });
                }
            }

            const allowTransfer = [...allowTransferSet].map((item) => {
                return Array.isArray(item) ? item.join(';') : item;
            }).join(';');

            let result = '';

            result += `zone "${domain.key}" {\n`;
            result += '    type slave;\n';
            result += `    file "${domain.zonePath}";\n`;
            result += `    masters { ${Object.keys(domain.masters.reduce((store, item) => {
                const server = config.parser.servers.map[item];
                if (server) {
                    const wan3 = server.wan3;
                    if (wan3) {
                        store[wan3] = true;
                    }
                    const wan36 = server.wan36;
                    if (wan36) {
                        store[wan36] = true;
                    }
                    const lan3 = server.lan3;
                    if (lan3) {
                        store[lan3] = true;
                    }
                } else {
                    store[item] = true;
                }
                return store;
            }, {})).join(';')}; };\n`;
            result += `    allow-transfer { ${allowTransfer || 'none'}; };\n`;
            result += '};';

            return result;
        }

        let viewResult = '';

        // LOCAL VIEWS
        {
            const lans = (config.parser.location.lans || {}).list || [config.parser.location.lans];
            for (const lan of lans) {
                if (!lan) {
                    continue;
                }
                const lanKey = lan.key;
                const viewKey = `local-${lanKey}`;

                const zonesLocalPath = path.normalize(`${config._outputPath}/dns/${viewKey}`);
                await mkdirSafe(zonesLocalPath);

                viewResult += `view ${viewKey} {\n`;
                viewResult += `    match-clients { ${lan.networkCidr}; };\n`;
                viewResult += '    recursion yes;\n';
                viewResult += '    include "/usr/local/etc/namedb/default.zones";\n';
                viewResult += '\n';

                const viewSource = config.parser.buildDnsView(lan);
                for (const domain of viewSource.list) {
                    const obj = domain.toSourceObject();
                    obj.source = domain.source;
                    obj.key = domain.key.replace(/^\./, '');
                    obj.type = viewKey;
                    if (obj.mode === 'static') {
                        obj.zonePath = `master/beaver/${viewKey}/${obj.key}.dns`;
                        await generateDomainFile(obj, path.normalize(`${zonesLocalPath}/${obj.key}.dns`));
                        const zoneConf = printZoneMasterConf('local', obj);
                        viewResult += `    ${zoneConf.split('\n').join('\n    ')}\n`;
                    } else if (obj.mode === 'slave') {
                        obj.zonePath = `slave/beaver-${viewKey}-${obj.key}.dns`;
                        const zoneConf = printZoneSlaveConf('local', obj);
                        viewResult += `    ${zoneConf.split('\n').join('\n    ')}\n`;
                    }
                }

                viewResult += '};\n';
            }
        }

        // GLOBAL VIEW
        {
            const viewKey = 'global';

            const zonesGlobalPath = path.normalize(`${config._outputPath}/dns/${viewKey}`);
            await mkdirSafe(zonesGlobalPath);

            const acmeZonesConf = `${zonesPath}/acme.conf`;
            if (!await checkFileExists(acmeZonesConf)) {
                await fs.writeFile(acmeZonesConf, '');
            }

            const matchClients = ['127.0.0.1'];
            const net3 = config.parser.location.net3;
            if (net3) {
                if (net3.list) {
                    for (const item of net3.list) {
                        matchClients.push(item.networkCidr);
                    }
                } else if (net3.networkCidr) {
                    matchClients.push(net3.networkCidr);
                }
            }

            viewResult += `view ${viewKey} {\n`;
            viewResult += '    match-clients { "any"; };\n';
            viewResult += `    allow-recursion { ${matchClients.join(';')}; };\n`;
            viewResult += '    include "/usr/local/etc/namedb/default.zones";\n';
            viewResult += '    include "/usr/local/etc/namedb/master/beaver/acme.conf";\n';
            viewResult += '\n';

            for (const domain of domains) {
                if (domain.mode === 'static') {
                    domain.zonePath = `master/beaver/${viewKey}/${domain.key}.dns`;
                    for (const route of config.parser.targetListWeb) {
                        const preset = openssl.getPreset(route);
                        if (preset && preset.acmeDns) {
                            if (route.key.match(`${domain.key}$`)) {
                                const key = `_acme-challenge${(`.${route.key}`).replace(new RegExp(`.${domain.key}$`), '')}`;
                                domain.dns.NS[key] = [`${preset.master}.`];
                            }
                        }
                    }
                    await generateDomainFile(domain, path.normalize(`${zonesGlobalPath}/${domain.key}.dns`));
                    const zoneConf = printZoneMasterConf('global', domain);
                    viewResult += `    ${zoneConf.split('\n').join('\n    ')}\n`;
                } else if (domain.mode === 'dedicated') {
                    domain.zonePath = `master/beaver/${viewKey}/${domain.key}.dns`;
                    await generateDomainFile(domain, path.normalize(`${zonesGlobalPath}/${domain.key}.dns`));
                    const zoneConf = printZoneMasterConf('global', domain);
                    viewResult += `    ${zoneConf.split('\n').join('\n    ')}\n`;
                } else if (domain.mode === 'slave') {
                    domain.zonePath = `slave/beaver-${viewKey}-${domain.key}.dns`;
                    const zoneConf = printZoneSlaveConf('global', domain);
                    viewResult += `    ${zoneConf.split('\n').join('\n    ')}\n`;
                }
            }

            viewResult += '};\n';
        }

        await fs.writeFile(`${zonesPath}/default.conf`, viewResult);

        debug('done');
    },
};
