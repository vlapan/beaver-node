const fs = require('node:fs/promises');

const { file } = require('../../utils/tpl');
const { parseKey, parseAcls } = require('../../utils/structure');

const drawTemplate = (o) => file`
    #!/bin/sh
    fw="/sbin/ipfw -qf"


    $fw nat ${o.natDynamicId} config ip ${o.externalIp} unreg_only

    $fw nat ${o.natServiceId} delete
    $fw nat ${o.natServiceId} config ip ${o.externalIp} unreg_only \\
        ${o.portForward.map((item) => `redirect_port ${item.type} ${item.lclIp}:${item.lclPort} ${item.extPort}${item.comment ? `${' '.repeat(o.portForwardMaxLength - item.valueLength)} $(: ${item.comment} )` : ''}`).join(' \\\n        ')}

    : | $fw /dev/stdin <<- EOF
        set disable 2
        delete set 2


        set 2 table tinc-tap-l6-hosts-remote create missing
        set 2 table tinc-tap-l6-hosts-remote-tmp create or-flush
        ${o.tincRemote.map((item) => `set 2 table tinc-tap-l6-hosts-remote-tmp add ${item.ip} ${item.tapIp} \t #   ${item.comment}`).join('\n        ')}
        set 2 table tinc-tap-l6-hosts-remote-tmp swap tinc-tap-l6-hosts-remote
        set 2 table tinc-tap-l6-hosts-remote-tmp destroy


        set 2 table tinc-tap-l6-hosts-local create missing
        set 2 table tinc-tap-l6-hosts-local-tmp create or-flush
        ${o.tincLocal.map((item) => `set 2 table tinc-tap-l6-hosts-local-tmp add ${item.ip} \t\t\t #   ${item.comment}`).join('\n        ')}
        set 2 table tinc-tap-l6-hosts-local-tmp swap tinc-tap-l6-hosts-local
        set 2 table tinc-tap-l6-hosts-local-tmp destroy

        ${
            Object.entries(o.tables).map((x) => {
                const table = [];
                table.push(
                    `set 2 table ${x[0]} create missing`,
                    `set 2 table ${x[0]}-tmp create or-flush`,
                );
                const max = Math.max.apply(undefined, x[1].map((x) => x.value.length));
                for (const item of x[1]) {
                    if (!item.value) {
                        continue;
                    }
                    table.push(`set 2 table ${x[0]}-tmp add ${item.key ? `${item.key} ` : ''}${item.value}${item.comment ? `${' '.repeat(max - item.value.length)} # ${item.comment}` : ''}`);
                }
                table.push(
                    `set 2 table ${x[0]}-tmp swap ${x[0]}`,
                    `set 2 table ${x[0]}-tmp destroy`,
                );
                return table.join('\n        ');
            }).join('\n\n        ')
        }


        add 504 set 2 allow tcp from any to me dst-port 80,443 in // public http
        add 504 set 2 allow tcp from any to me dst-port 22,27 in // management ssh
        add 504 set 2 count tcp from any to me dst-port 53 in // tcp dns
        add 504 set 2 allow ip from any to me dst-port 53 in // dns

        ${
            (o.tincClosed ? [
                `add 504 set 2 allow ip from table(${o.tincClosed}) to me dst-port ${o.tincPort} in // tinc: allow specific`,
                `add 504 set 2 deny ip from any to me dst-port ${o.tincPort} in // tinc: deny others`,
            ] : [
                `add 504 set 2 allow ip from any to me dst-port ${o.tincPort} in // tinc: allow all`,
            ]).join('\n        ')
        }

        ${
            (o.beaverClosed ? [
                `add 504 set 2 allow ip from table(${o.beaverClosed}) to me dst-port ${o.beaverPort} in // beaver-api: allow specific`,
                `add 504 set 2 deny ip from any to me dst-port ${o.beaverPort} in // beaver-api: deny others`,
            ] : [
                `add 504 set 2 allow ip from any to me dst-port ${o.beaverPort} in // beaver-api: allow all`,
            ]).join('\n        ')
        }

        add 508 set 2 count ip6 from me to not me out // ipv6 of all
        add 508 set 2 count udp from me to not me out // udp of all
        add 508 set 2 allow ip from me to not me out // all outgoing blindly allowed

        set 2 table service-wan create missing type flow:dst-ip,dst-port
        set 2 table service-wan-tmp create or-flush type flow:dst-ip,dst-port
        ${o.natServiceWan.map((item) => `set 2 table service-wan-tmp add ${o.externalIp},${item.extPort}${item.comment ? `${' '.repeat(o.natServiceWanMaxLength - item.valueLength)} # ${item.comment}` : ''}`).join(' \n        ')}
        set 2 table service-wan swap service-wan-tmp
        set 2 table service-wan-tmp destroy

        set 2 table service-lan create missing type flow:src-ip,src-port
        set 2 table service-lan-tmp create or-flush type flow:src-ip,src-port
        ${o.natServiceLan.map((item) => `set 2 table service-lan-tmp add ${item.lclIp},${item.lclPort}${item.comment ? `${' '.repeat(o.natServiceLanMaxLength - item.valueLength)} # ${item.comment}` : ''}`).join(' \n        ')}
        set 2 table service-lan swap service-lan-tmp
        set 2 table service-lan-tmp destroy

        add 515 set 2 skipto 518 ip from 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 to not me flow table(service-lan)
        add 515 set 2 skipto 518 ip from any to ${o.externalIp} flow table(service-wan)

        add 516 set 2 nat ${o.natDynamicId} tag 7 ip from any to ${o.externalIp} in // incoming nat, dynamic
        add 516 set 2 nat ${o.natDynamicId} out tagged 7 // incoming nat, dynamic
        add 516 set 2 nat ${o.natDynamicId} ip from 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 to not 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 out // outgoing nat, dynamic
        add 517 set 2 skipto 519 ip from any to any

        add 518 set 2 nat ${o.natServiceId} tag 7 ip from any to ${o.externalIp} in // incoming nat, service
        add 518 set 2 nat ${o.natServiceId} out tagged 7 // incoming nat, service
        add 518 set 2 nat ${o.natServiceId} ip from 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 to not 10.0.0.0/8,172.16.0.0/12,192.168.0.0/16 out // outgoing nat, service


        add 800 set 2 deny icmp from me to table(tinc-tap-l6-hosts-local) icmptype 5 in // block redirects for tincd
        ${o.tincMode === 'switch' ? 'add 800 set 2 fwd tablearg ip from table(tinc-tap-l6-hosts-local) to table(tinc-tap-l6-hosts-remote) in // tincd forward' : ''}


        add 900 set 2 count ip6 from any to any // ipv6 of all
        add 900 set 2 count ip from not me to me in // incoming of all
        add 900 set 2 allow ip from any to any // all traffic blindly allowed

        set swap 2 1
        set enable 1
        delete set 2
        set 2 table all destroy
    EOF
`;

function getObject(parser, argv) {
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
        tables[beaverClosed] = parseAcls(parser, new Set(['@routers', parser.routing?.options?.beaver?.acl].flat().filter(Boolean)));
    }
    const tincClosed = parser.source?.routing?.options?.tinc?.closed === true && 'tinc-acl-table';
    if (tincClosed) {
        tables[tincClosed] = parseAcls(parser, new Set(['@routers', parser.routing?.options?.tinc?.acl].flat().filter(Boolean)));
    }

    const portForwardView = parser.buildPortForwardView();
    const natServiceWan = Object.values(portForwardView).map((x) => {
        const y = { ...x };
        y.valueLength = `${parser.location.wan3}${y.extPort}`.length;
        return y;
    });
    const natServiceLan = Object.values(portForwardView).map((x) => {
        const y = { ...x };
        y.valueLength = `${y.lclIp}${y.lclPort}`.length;
        return y;
    });
    const portForward = Object.values(portForwardView).map((x) => {
        x.valueLength = `${x.type}${x.lclIp}${x.lclPort}${x.extPort}`.length;
        return x;
    });
    return {
        natServiceId: 1,
        natDynamicId: 2,
        natServiceLan,
        natServiceLanMaxLength: Math.max.apply(undefined, natServiceLan.map((x) => x.valueLength)),
        natServiceWan,
        natServiceWanMaxLength: Math.max.apply(undefined, natServiceWan.map((x) => x.valueLength)),
        portForward,
        portForwardMaxLength: Math.max.apply(undefined, portForward.map((x) => x.valueLength)),
        iface: parser.server.source.wan.iface,
        externalIp: parser.location.wan3 || parser.server.wan3,
        externalIp6: parser.location.wan36 || parser.server.wan36,
        tincPort: 655,
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
