const net = require('node:net');
const getHash = require('./hash.js');

const M = {
    parseObjective(parser, k) {
        const result = new Set();
        const objective = k.replace(/^@/, '');
        const [cmd, key] = objective.split(':');
        switch (cmd) {
            case 'locations': {
                for (const location of parser.locations.list) {
                    result.add(location.key);
                }
                break;
            }
            case 'location': {
                if (key) {
                    result.add(key);
                }
                break;
            }
            case 'zone': {
                for (const location of parser.locations.list) {
                    if ((location.source?.zone ?? '') === key) {
                        result.add(location.key);
                    }
                }
                break;
            }
            case 'routers': {
                for (const router of parser.routers.list) {
                    result.add(router.key);
                }
                break;
            }
            case 'servers': {
                for (const server of parser.servers.list) {
                    result.add(server.key);
                }
                break;
            }
            case 'server': {
                if (key) {
                    result.add(key);
                }
                break;
            }
        }
        return result;
    },
    parseKey(parser, k, a, n = true) {
        if (k.startsWith('@')) {
            for (const key of M.parseObjective(parser, k)) {
                M.parseKey(parser, key, a, n);
            }
            return a;
        }

        const location = parser.locations.map[k];
        if (location) {
            const net3 = location.net3;
            if (net3) {
                if (net3.list) {
                    for (const item of net3.list) {
                        a.set(`${n === false ? item.ip : item.networkCidr}`, `${location.toString()}: NET3`);
                    }
                } else if (net3.networkCidr) {
                    a.set(`${n === false ? net3.ip : net3.networkCidr}`, `${location.toString()}: NET3`);
                }
            }
            const wan36 = location.wan36;
            if (wan36) {
                for (const item of [wan36].flat()) {
                    const netmask = item.match(/\/\d+$/);
                    a.set(`${n === false ? item.replace(/\/\d+$/, '') : (netmask ? item : `${item}/128`)}`, `${location.toString()}: WAN36`);
                }
            }
            const lans = location.lans;
            if (lans) {
                if (lans.list) {
                    for (const item of lans.list) {
                        a.set(`${n === false ? item.ip : item.networkCidr}`, `${location.toString()}: LANS`);
                    }
                } else if (lans.networkCidr) {
                    a.set(`${n === false ? lans.ip : lans.networkCidr}`, `${location.toString()}: LANS`);
                }
            }
            return a;
        }

        const server = parser.servers.map[k];
        if (server) {
            const wan3 = server.wan3;
            if (wan3) {
                a.set(`${wan3}${n === false ? '' : '/32'}`, `${server.location.toString()}: ${server.toString()}: WAN3`);
            }
            const wan36 = server.wan36;
            if (wan36) {
                a.set(`${wan36}${n === false ? '' : '/128'}`, `${server.location.toString()}: ${server.toString()}: WAN36`);
            }
            const lan3 = server.lan3;
            if (lan3) {
                a.set(`${lan3}${n === false ? '' : '/32'}`, `${server.location.toString()}: ${server.toString()}: LAN3`);
            }
            return a;
        }

        const s = k.split('#');
        const kk = s.shift().trim();
        if (kk) {
            const comment = s.join('#').trim();
            const ipVersion = net.isIP(kk);
            const netmask = n === false ? '' : (ipVersion === 4 ? '/32' : (ipVersion === 6 ? '/128' : ''));
            const commentFinal = comment ? `static entry: ${comment}` : 'static entry';
            a.set(`${kk}${netmask}`, commentFinal);
        }
        return a;
    },
    parseAcls: (parser, acls = new Set(), result = new Map(), n = true) => {
        for (const key of acls) {
            if (key.startsWith('acl:')) {
                const keyClean = key.replace(/^acl:/, '');
                const acl = parser.routing?.options?.acls?.[keyClean] ?? parser.routing?.options?.dns?.acl?.[keyClean];
                if (acl) {
                    M.parseAcls(parser, acl, result, n);
                }
                continue;
            }
            M.parseKey(parser, key, result, n);
        }
        return [...result].map(([value, comment]) => ({
            value,
            comment,
        }));
    },
    redact: (data) => {
        for (const item of Object.values(data?.monitoring?.notify || {})) {
            if (item.auth) {
                item.auth = `[REDACTED: ${getHash(item.auth)}]`;
            }
        }
        for (const item of Object.values(data?.services?.git?.repositories || {})) {
            if (item.repository) {
                item.repository = item.repository.replace(/(http[s]?:\/\/)([\w\.\-]+:[\w\.\-]+@)(.*)/, (m, p1, p2, p3) => `${p1}${p2 ? `[REDACTED: ${getHash(p2)}]@` : ''}${p3}`);
            }
            if (item.updateHook) {
                item.updateHook = item.updateHook.replace(/(.*)\/(.*)/, (m, p1, p2) => `${p1}/${p2 ? `[REDACTED: ${getHash(p2)}]` : ''}`);
            }
            if (item.updateHookSecret) {
                item.updateHookSecret = `[REDACTED: ${getHash(item.updateHookSecret)}]`;
            }
        }
        for (const authority of Object.values(data?.services?.pki?.authorities || {})) {
            for (const item of Object.values(authority?.external || {}))
            if (item.csr) {
                item.csr = `[REDACTED: ${getHash(item.csr)}]`;
            }
        }
        return data;
    },
};

module.exports = M;
