const fs = require('node:fs/promises');

const { file } = require('../../utils/tpl');
const { parseKey } = require('../../utils/structure');

const drawTemplate = (o) => file`
    #!/bin/sh
    fw="/sbin/ipfw -qf"

    \${fw} nat 1 config ${o.iface ? `if ${o.iface}` : `ip ${o.externalIp}`} unreg_only \\
        ${o.portForward.map((item) => `redirect_port ${item.type} ${item.lclIp}:${item.lclPort} ${item.extPort} $(true || comment ${item.comment})`).join(' \\\n        ')}


    \${fw} set disable 2 || true
    \${fw} delete set 2 || true


    \${fw} set 2 table tinc-tap-l6-hosts-remote create or-flush || true \t\t\t # 5: remote
    ${o.tincRemote.map((item) => `\${fw} set 2 table tinc-tap-l6-hosts-remote add ${item.ip} ${item.tapIp} \t #   ${item.comment}`).join('\n')}


    \${fw} set 2 table tinc-tap-l6-hosts-local create or-flush || true \t\t\t # 6: local
    ${o.tincLocal.map((item) => `\${fw} set 2 table tinc-tap-l6-hosts-local add ${item.ip} \t\t\t #   ${item.comment}`).join('\n')}


    ${
        Object.entries(o.tables).map((x) => {
            const table = [];
            table.push(`\${fw} set 2 table ${x[0]} create or-flush`);
            const max = Math.max.apply(undefined, x[1].map((x) => x.value.length));
            for (const item of x[1]) {
                if (!item.value) {
                    continue;
                }
                table.push(`\${fw} set 2 table ${x[0]} add ${item.key ? `${item.key} ` : ''}${item.value}${item.comment ? `${' '.repeat(max - item.value.length)} # ${item.comment}` : ''}`);
            }
            return table.join('\n');
        }).join('\n\n')
    }


    \${fw} add 504 set 2 allow tcp from any to me dst-port 80,443 in // public http
    \${fw} add 504 set 2 allow tcp from any to me dst-port 22,27 in // management ssh
    \${fw} add 504 set 2 count tcp from any to me dst-port 53 in // tcp dns
    \${fw} add 504 set 2 allow ip from any to me dst-port 53 in // dns

    \${fw} add 504 set 2 count ip from any to me dst-port 655 in // tinc: count all
    ${
        o.tincClosed ? file`
            \${fw} add 504 set 2 allow ip from 'table(${o.tincClosed})' to me dst-port 655 in // tinc: allow specific
            \${fw} add 504 set 2 deny ip from any to me dst-port 655 in // tinc: deny others
        ` : file`
            \${fw} add 504 set 2 allow ip from any to me dst-port 655 in // tinc: allow all
        `
    }

    \${fw} add 504 set 2 count ip from any to me dst-port ${o.beaverPort} in // beaver-api: count all
    ${
        o.beaverClosed ? file`
            \${fw} add 504 set 2 allow ip from 'table(${o.beaverClosed})' to me dst-port ${o.beaverPort} in // beaver-api: allow specific
            \${fw} add 504 set 2 deny ip from any to me dst-port ${o.beaverPort} in // beaver-api: deny others
        ` : file`
            \${fw} add 504 set 2 allow ip from any to me dst-port ${o.beaverPort} in // beaver-api: allow all
        `
    }

    \${fw} add 508 set 2 count ip6 from me to not me out // ipv6 of all
    \${fw} add 508 set 2 count udp from me to not me out // udp of all
    \${fw} add 508 set 2 allow ip from me to not me out // all outgoing blindly allowed


    \${fw} add 518 set 2 nat 1 ip from any to ${o.externalIp} in${o.iface ? ` recv ${o.iface}` : ''} // incoming nat
    \${fw} add 518 set 2 skipto 700 ip from 10.0.0.0/8 to 10.0.0.0/8 // local traffic
    \${fw} add 518 set 2 skipto 700 ip from 172.16.0.0/12 to 172.16.0.0/12 // local traffic
    \${fw} add 518 set 2 skipto 700 ip from 192.168.0.0/16 to 192.168.0.0/16 // local traffic


    \${fw} add 608 set 2 nat 1 ip from 10.0.0.0/8 to any out${o.iface ? ` xmit ${o.iface}` : ''} // outgoing nat
    \${fw} add 608 set 2 nat 1 ip from 172.16.0.0/12 to any out${o.iface ? ` xmit ${o.iface}` : ''} // outgoing nat
    \${fw} add 608 set 2 nat 1 ip from 192.168.0.0/16 to any out${o.iface ? ` xmit ${o.iface}` : ''} // outgoing nat


    \${fw} add 800 set 2 deny icmp from me to 'table(tinc-tap-l6-hosts-local)' icmptype 5 in // block redirects for tincd
    ${o.tincMode === 'switch' ? '${fw} add 800 set 2 fwd tablearg ip from \'table(tinc-tap-l6-hosts-local)\' to \'table(tinc-tap-l6-hosts-remote)\' in // tincd forward' : ''}


    \${fw} add 900 set 2 count ip6 from any to any // ipv6 of all
    \${fw} add 900 set 2 count ip from not me to me in // incoming of all
    \${fw} add 900 set 2 allow ip from any to any // all traffic blindly allowed

    \${fw} set swap 2 1 || true
    \${fw} delete set 2 || true
`;

function getObject(parser, argv) {
    const parseAcls = (acls = new Set()) => {
        const result = new Map();
        for (const key of acls) {
            if (key.startsWith('acl:')) {
                const keyClean = key.replace(/^acl:/, '');
                const acl = parser.routing?.options?.acls?.[keyClean];
                if (acl) {
                    for (const item of acl) {
                        parseKey(parser, item, result);
                    }
                }
                continue;
            }
            parseKey(parser, key, result);
        }
        return [...result].map(([value, comment]) => ({
            value,
            comment
        }));
    };

    const myZone = parser.server.location.source.zone ?? '';
    const servers = parser.servers.list.reduce((o, item) => {
        if (item.source.net && item.source.lan && item.source.lan.ip && myZone === (item.location.source.zone ?? '')) {
            const group = item.location === parser.server.location ? 'local' : 'remote';
            o[group].push(item);
        }
        return o;
    }, {
        remote: [],
        local: [],
    });

    const tables = {
        ...((tables = {}) => {
            return Object.fromEntries(Object.entries(tables).map(([key, table]) => {
                const result = [...[table].flat().reduce((a, k) => {
                    parseKey(parser, k, a);
                    return a;
                }, new Map())].map(([value, comment]) => ({
                    value,
                    comment
                }));
                return [key, result];
            }));
        })(parser.routing?.options?.firewall?.tables),
    };
    const beaverClosed = parser.source?.routing?.options?.beaver?.closed === true && 'beaver-acl-table';
    if (beaverClosed) {
        tables[beaverClosed] = parseAcls(new Set(['@routers', parser.routing?.options?.beaver?.acl].flat().filter(Boolean)));
    }
    const tincClosed = parser.source?.routing?.options?.tinc?.closed === true && 'tinc-acl-table';
    if (tincClosed) {
        tables[tincClosed] = parseAcls(new Set(['@routers', parser.routing?.options?.tinc?.acl].flat().filter(Boolean)));
    }

    return {
        iface: parser.server.source.wan.iface,
        externalIp: parser.location.wan3,
        externalIp6: parser.location.wan36,
        portForward: Object.values(parser.buildPortForwardView()),
        tincMode: parser.source?.routing?.options?.tinc?.mode ?? 'switch',
        tincRemote: servers.remote.reduce((arr, item) => {
            const location = parser.locations.map[item.source.location];
            if (location) {
                const tapIp = location.tap3smart[0];
                if (tapIp) {
                    arr.push({
                        ip: item.source.lan.ip,
                        tapIp,
                        comment: `${item.source.net}: ${item.key}`,
                    });
                }
            }
            return arr;
        }, []),
        tincLocal: servers.local.map((item) => {
            return {
                ip: item.source.lan.ip,
                comment: `${item.source.net}: ${item.key}`,
            };
        }),
        beaverPort: argv.httpsPort,
        beaverClosed,
        tincClosed,
        tables,
    };
}

async function generate(o) {
    const debug = o.debug.extend('ipfw');
    debug('start');
    const obj = getObject(o.config.parser, o.argv);
    debug('get config, done');
    const tpl = drawTemplate(obj);
    debug('draw template, done');
    try {
        await fs.writeFile(`${o.config._outputPath}/ipfw.sh`, tpl);
    } catch (error) {
        console.error(error);
        throw error;
    }
    debug('done');
}

module.exports = {
    drawTemplate,
    getObject,
    generate,
};
