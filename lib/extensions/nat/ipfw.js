const fs = require('node:fs/promises');

const { file } = require('../../utils/tpl');

const drawTemplate = (o) => file`
    #!/bin/sh
    fw="/sbin/ipfw -qf"


    #\${fw} nat 1 delete #
    \${fw} nat 1 config ${o.iface ? `if ${o.iface}` : `ip ${o.externalIp}`} unreg_only \\
        ${o.portForward.map((item) => `redirect_port ${item.type} ${item.lclIp}:${item.lclPort} ${item.extPort} $(true || comment ${item.comment})`).join(' \\\n        ')}


    \${fw} set disable 2 || true
    \${fw} delete set 2 || true



    \${fw} set 2 table tinc-tap-l6-hosts-remote create or-flush || true \t\t\t # 5: remote
    ${o.tincRemote.map((item) => `\${fw} set 2 table tinc-tap-l6-hosts-remote add ${item.ip} ${item.tapIp} \t #   ${item.comment}`).join('\n')}


    \${fw} set 2 table tinc-tap-l6-hosts-local create or-flush || true \t\t\t # 6: local
    ${o.tincLocal.map((item) => `\${fw} set 2 table tinc-tap-l6-hosts-local add ${item.ip} \t\t\t #   ${item.comment}`).join('\n')}


    \${fw} add 504 set 2 allow tcp from any to me dst-port 80,443 in // public http
    \${fw} add 504 set 2 allow tcp from any to me dst-port 22,27 in // management ssh
    \${fw} add 504 set 2 count tcp from any to me dst-port 53 in // tcp dns
    \${fw} add 504 set 2 count ip from any to me dst-port 655 in // tincd
    \${fw} add 504 set 2 allow ip from any to me dst-port 53,655 in // dns + tincd


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

    \${fw} set enable 2 || true
    \${fw} set swap 2 1 || true
    \${fw} delete set 2 || true
`;

function getObject(parser) {
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
    };
}

async function generate(o) {
    const debug = o.debug.extend('ipfw');
    debug('start');
    const obj = getObject(o.config.parser);
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
