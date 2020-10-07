const fs = require('fs/promises');

const { file } = require('../../utils/tpl');

const drawTemplate = (o) => file`
    #!/bin/sh
    fw="/sbin/ipfw"

    \${fw} nat 1 config ${o.iface ? `if ${o.iface}` : `ip ${o.externalIp}`} unreg_only \\
        ${o.portForward.map((item) => `redirect_port ${item.type} ${item.lclIp}:${item.lclPort} ${item.extPort} $(true || comment ${item.comment})`).join(' \\ \n        ')}


    \${fw} -f table 5 flush || true \t\t\t # 5: remote
    ${o.table5.map((item) => `\${fw} table 5 add ${item.ip} ${item.tapIp} \t #   ${item.comment}`).join('\n')}

    \${fw} -f table 6 flush || true \t\t\t # 6: local
    ${o.table6.map((item) => `\${fw} table 6 add ${item.ip} \t\t\t #   ${item.comment}`).join('\n')}


    \${fw} delete 504 || true
    \${fw} add 504 allow tcp from any to me dst-port 80,443 in // public http
    \${fw} add 504 allow tcp from any to me dst-port 22,27 in // management ssh
    \${fw} add 504 count tcp from any to me dst-port 53 in // tcp dns
    \${fw} add 504 count ip from any to me dst-port 655 in // tincd
    \${fw} add 504 allow ip from any to me dst-port 53,655 in // dns + tincd

    \${fw} delete 506 || true
    \${fw} add 506 allow ip from any to any via lo0 // local internal

    \${fw} delete 508 || true
    \${fw} add 508 count ip6 from me to not me out // ipv6 of all
    \${fw} add 508 count udp from me to not me out // udp of all
    \${fw} add 508 allow ip from me to not me out // all outgoing blindly allowed

    \${fw} delete 518 || true
    \${fw} add 518 nat 1 ip from any to ${o.externalIp} in${o.iface ? ` recv ${o.iface}` : ''} // incoming nat
    \${fw} add 518 skipto 700 ip from 10.0.0.0/8 to 10.0.0.0/8 // local traffic
    \${fw} add 518 skipto 700 ip from 172.16.0.0/12 to 172.16.0.0/12 // local traffic
    \${fw} add 518 skipto 700 ip from 192.168.0.0/16 to 192.168.0.0/16 // local traffic

    \${fw} delete 608 || true
    \${fw} add 608 nat 1 ip from 10.0.0.0/8 to any out${o.iface ? ` xmit ${o.iface}` : ''} // outgoing nat
    \${fw} add 608 nat 1 ip from 172.16.0.0/12 to any out${o.iface ? ` xmit ${o.iface}` : ''} // outgoing nat
    \${fw} add 608 nat 1 ip from 192.168.0.0/16 to any out${o.iface ? ` xmit ${o.iface}` : ''} // outgoing nat


    \${fw} delete 800 || true
    \${fw} add 800 deny icmp from me to 'table(6)' icmptype 5 in // block redirects for tincd
    \${fw} add 800 fwd tablearg ip from 'table(6)' to 'table(5)' in // tincd forward


    \${fw} delete 900 || true
    \${fw} add 900 count ip6 from any to any // ipv6 of all
    \${fw} add 900 count ip from not me to me in // incoming of all
    \${fw} add 900 allow ip from any to any // all traffic blindly allowed
`;

function getObject(parser) {
    const servers = parser.servers.list.reduce((o, item) => {
        if (item.source.net && item.source.lan && item.source.lan.ip) {
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
        externalIp: parser.location.wan3 || parser.server.source.wan.ip,
        externalIp6: parser.location.wan36,
        portForward: Object.values(parser.buildPortForwardView()),
        table5: servers.remote.reduce((arr, item) => {
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
        table6: servers.local.map((item) => { 
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
    } catch(error) {
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
