const fs = require('fs/promises');
const path = require('path');
const zonefile = import('dns-zonefile');

const openssl = require('../../openssl');
const { mkdirSafe, checkFileExists } = require('../../utils/fs');

module.exports = {
    async generate(o) {
        const debug = o.debug.extend('dns');

        debug('start');

        const options = o.config.routing.options && typeof o.config.routing.options.dns === 'object' ? o.config.routing.options.dns : {};
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

        const zonesPath = path.normalize(`${o.config._outputPath}/dns`);
        await mkdirSafe(zonesPath);

        function transform(obj, keys) {
            const entries = [];
            for (const item of obj.list) {
                const key = item.key;
                const value = item.value;
                const comment = item.comment ? `\t; ${item.comment}` : '';
                (Array.isArray(value) ? value : [value]).forEach((item) => {
                    const entry = {};
                    entry[keys.key || 'name'] = key;
                    if (typeof keys.override === 'function') {
                        keys.override(entry, item, comment);
                    } else {
                        entry[keys.value || 'value'] = (keys.value === 'txt' && ~item.indexOf(' ') ? `"${item}"` : item) + comment;
                    }
                    entries.push(entry);
                });
            }
            return entries;
        }

        async function generateDomainFile(domain, routePath) {
            const data = {
                $origin: `${domain.keyClean}.`,
                $ttl: options.ttl,
                soa: {
                    mname: `${o.config._hostname}.`,
                    rname: `admin.${domain.keyClean}.`,
                    serial: '{time}',
                    refresh: options.refresh,
                    retry: options.retry,
                    expire: options.expire,
                    minimum: options.minimum,
                },
            };
            const dns = domain.dns.map;
            if (typeof dns === 'object') {
                if (typeof dns.NS === 'object') {
                    data.ns = transform(dns.NS, {
                        value: 'host',
                    });
                }
                if (typeof dns.A === 'object') {
                    data.a = transform(dns.A, {
                        value: 'ip',
                    });
                }
                if (typeof dns.AAAA === 'object') {
                    data.aaaa = transform(dns.AAAA, {
                        value: 'ip',
                    });
                }
                if (typeof dns.CNAME === 'object') {
                    data.cname = transform(dns.CNAME, {
                        value: 'alias',
                    });
                }
                if (typeof dns.MX === 'object') {
                    data.mx = transform(dns.MX, {
                        override: (entry, item, comment) => {
                            const arr = item.split(' ');
                            entry.preference = arr.shift();
                            entry.host = `${arr.join(' ')}${comment}`;
                        },
                    });
                }
                if (typeof dns.TXT === 'object') {
                    data.txt = transform(dns.TXT, {
                        value: 'txt',
                    });
                }
                if (typeof dns.SRV === 'object') {
                    data.srv = transform(dns.SRV, {
                        override: (entry, item, comment) => {
                            if (typeof item === 'string') {
                                const s = item.split(' ');
                                entry.name = entry.name.match(/^[0-9]+$/) ? '@' : entry.name;
                                entry.priority = s[0];
                                entry.weight = s[1];
                                entry.port = s[2];
                                entry.target = `${s[3]}${comment}`;
                            } else if (typeof item === 'object') {
                                // entry.name = item.name;
                                if (item.ttl) {
                                    entry.ttl = item.ttl;
                                }
                                entry.priority = item.priority;
                                entry.weight = item.weight;
                                entry.port = item.port;
                                entry.target = `${item.target}${comment}`;
                            }
                        },
                    });
                }
                if (typeof dns.CAA === 'object') {
                    data.caa = transform(dns.CAA, {
                        override: (entry, item, comment) => {
                            if (typeof item === 'string') {
                                const s = item.split(' ');
                                entry.name = entry.name.match(/^[0-9]+$/) ? '@' : entry.name;
                                entry.flags = s[0];
                                entry.tag = s[1];
                                entry.value = `${s[2]}${comment}`;
                            } else if (typeof item === 'object') {
                                // entry.name = item.name;
                                if (item.ttl) {
                                    entry.ttl = item.ttl;
                                }
                                entry.flags = item.flags;
                                entry.tag = item.tag;
                                entry.value = `${item.value}${comment}`;
                            }
                        },
                    });
                }
            }

            data.a || (data.a = []);
            data.aaaa || (data.aaaa = []);
            data.ns || (data.ns = []);

            const output = (await zonefile).default.generate(data);

            await fs.writeFile(routePath, output);
            debug(`${routePath}: done`);
        }

        function printZoneMasterConf(type, domain) {
            const slaves = domain.slaves || domain.source['allow-transfer'];
            const allowTransferSet = new Set();
            if (slaves && type === 'global') {
                for (const item of (Array.isArray(slaves) ? slaves : [slaves])) {
                    const server = o.config.parser.servers.map[item];
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

            result += `zone "${domain.keyClean}" {\n`;
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
                        const server = o.config.parser.servers.map[item];
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
                    o.config.parser.routers.list.forEach((item) => {
                        item.wan && item.wan.ip && allowTransferSet.add(item.wan.ip);
                        item.lan && item.lan.ip && allowTransferSet.add(item.lan.ip);
                    });
                    o.config.parser.locations.list.forEach((item) => {
                        item.wan3 && allowTransferSet.add(item.wan3);
                        item.lan3 && allowTransferSet.add(item.lan3);
                    });
                }
            }

            const allowTransfer = [...allowTransferSet].map((item) => {
                return Array.isArray(item) ? item.join(';') : item;
            }).join(';');

            let result = '';

            result += `zone "${domain.keyClean}" {\n`;
            result += '    type slave;\n';
            result += `    file "${domain.zonePath}";\n`;
            result += `    masters { ${Object.keys(domain.masters.reduce((store, item) => {
                const server = o.config.parser.servers.map[item];
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
            const lans = (o.config.parser.location.lans || {}).list || [o.config.parser.location.lans];
            for (const lan of lans) {
                if (!lan) {
                    continue;
                }
                const lanKey = lan.key;
                const viewKey = `local-${lanKey}`;

                const zonesLocalPath = path.normalize(`${o.config._outputPath}/dns/${viewKey}`);
                await mkdirSafe(zonesLocalPath);

                viewResult += `view ${viewKey} {\n`;
                viewResult += `    match-clients { ${lan.networkCidr}; };\n`;
                viewResult += '    recursion yes;\n';
                viewResult += '    include "/usr/local/etc/namedb/default.zones";\n';
                viewResult += '\n';

                const viewSource = o.config.parser.buildDnsView(lan);
                for (const domain of viewSource.list) {
                    domain.keyClean = domain.key.replace(/^\./, '');
                    if (domain.mode === 'static') {
                        domain.zonePath = `master/beaver/${viewKey}/${domain.keyClean}.dns`;
                        await generateDomainFile(domain, path.normalize(`${zonesLocalPath}/${domain.keyClean}.dns`));
                        const zoneConf = printZoneMasterConf('local', domain);
                        viewResult += `    ${zoneConf.split('\n').join('\n    ')}\n`;
                    } else if (domain.mode === 'slave') {
                        domain.zonePath = `slave/beaver-${viewKey}-${domain.keyClean}.dns`;
                        const zoneConf = printZoneSlaveConf('local', domain);
                        viewResult += `    ${zoneConf.split('\n').join('\n    ')}\n`;
                    }
                }

                viewResult += '};\n';
            }
        }

        // GLOBAL VIEW
        {
            const viewKey = 'global';

            const zonesGlobalPath = path.normalize(`${o.config._outputPath}/dns/${viewKey}`);
            await mkdirSafe(zonesGlobalPath);

            const acmeZonesConf = `${zonesPath}/acme.conf`;
            if (!await checkFileExists(acmeZonesConf)) {
                await fs.writeFile(acmeZonesConf, '');
            }


            const allowRecursion = new Set();
            allowRecursion.add('127.0.0.1');

            const net3 = o.config.parser.location.net3;
            if (net3) {
                if (net3.list) {
                    for (const item of net3.list) {
                        allowRecursion.add(item.networkCidr);
                    }
                } else if (net3.networkCidr) {
                    allowRecursion.add(net3.networkCidr);
                }
            }

            for (const server of o.config.parser.servers.list) {
                if (server.location === o.config.parser.server.location) {
                    const wanIp = server?.source?.wan?.ip;
                    if (wanIp) {
                        allowRecursion.add(wanIp);
                    }
                }
            }

            viewResult += `view ${viewKey} {\n`;
            viewResult += '    match-clients { "any"; };\n';
            viewResult += `    allow-recursion { ${Array.from(allowRecursion).join(';')}; };\n`;
            viewResult += '    include "/usr/local/etc/namedb/default.zones";\n';
            viewResult += '    include "/usr/local/etc/namedb/master/beaver/acme.conf";\n';
            viewResult += '\n';

            const domains = o.config.parser.buildDnsView(null);
            for (const domain of domains.list) {
                domain.keyClean = domain.key.replace(/^\./, '');
                if (domain.mode === 'static') {
                    domain.zonePath = `master/beaver/${viewKey}/${domain.keyClean}.dns`;
                    for (const route of o.config.parser.targetListWeb) {
                        const preset = openssl.getPreset(route);
                        if (preset && preset.acmeDns) {
                            const routeMatch = route.key.match(`${domain.keyClean}$`);
                            const mirrorDomainSuffix = (typeof preset.mirrorDomainSuffix === 'string' && preset.mirrorDomainSuffix.endsWith(domain.keyClean));
                            if (routeMatch || mirrorDomainSuffix) {
                                let key = `_acme-challenge${(`.${route.key}`).replace(new RegExp(`.${domain.keyClean}$`), '')}`;
                                if (!routeMatch && mirrorDomainSuffix) {
                                    key += `.${preset.mirrorDomainSuffix.replace(new RegExp(`.${domain.keyClean}$`), '')}`;
                                }
                                domain.dns.map.NS.put(key, {
                                    key: key,
                                    value: `${preset.master}.`,
                                    comment: 'global',
                                });
                            }
                        }
                    }
                    await generateDomainFile(domain, path.normalize(`${zonesGlobalPath}/${domain.keyClean}.dns`));
                    const zoneConf = printZoneMasterConf('global', domain);
                    viewResult += `    ${zoneConf.split('\n').join('\n    ')}\n`;
                } else if (domain.mode === 'dedicated') {
                    domain.zonePath = `master/beaver/${viewKey}/${domain.keyClean}.dns`;
                    await generateDomainFile(domain, path.normalize(`${zonesGlobalPath}/${domain.keyClean}.dns`));
                    const zoneConf = printZoneMasterConf('global', domain);
                    viewResult += `    ${zoneConf.split('\n').join('\n    ')}\n`;
                } else if (domain.mode === 'slave') {
                    domain.zonePath = `slave/beaver-${viewKey}-${domain.keyClean}.dns`;
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
