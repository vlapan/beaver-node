const fs = require('node:fs/promises');
const path = require('node:path');

const { intersects } = require('../../utils/index');
const { mkdirSafe } = require('../../utils/fs');

// TODO: multiple tinc networks require changes: each tinc needs separate port that binded to network name and cloud network ("net" property) needs separation
// maybe routing.options.tinc.taps:{“tap-l6-a”:{“port”:1655,“nets”:[“net1",“net2”]},“tap-l6-b”:1656,“nets”:[“net3"]}

function getTapsSafe(tap) {
    return [tap].flat().filter((x) => typeof x.name === 'string' && typeof x.ip === 'string' && typeof x.key === 'string');
}

const tinc = {
    async generate(o) {
        const debug = o.debug.extend('tinc');

        if (typeof o.config._hostConfig.tap !== 'object') {
            debug('no tap defined');
            return;
        }

        debug('start');

        const resultPath = path.normalize(`${o.config._outputPath}/tinc`);
        await mkdirSafe(resultPath);

        const myZone = [o.config.parser.server.location.zone ?? ''].flat();
        const nets = {};
        const serverTapNets = Object.fromEntries(getTapsSafe(o.config._hostConfig.tap).map((x) => [x.name, x]));

        for (const [key, server] of Object.entries(o.config.servers)) {
            if (typeof server.router !== 'string') {
                continue;
            }
            const serverZone = [o.config.parser.servers.map[key].location.zone ?? ''].flat();
            if (!intersects(myZone, serverZone)) {
                continue;
            }
            if (typeof server?.tap !== 'object') {
                continue;
            }
            const taps = getTapsSafe(server.tap);
            for (const tap of taps) {
                if (serverTapNets[tap.name]) {
                    const hosts = nets[tap.name] || {};
                    hosts[key] = server;
                    nets[tap.name] = hosts;
                }
            }
        }

        const options = o.config.routing.options && typeof o.config.routing.options.tinc === 'object' ? o.config.routing.options.tinc : {};
        if (typeof options.compression !== 'number' || options.compression < 0 || options.compression > 9) {
            options.compression = 7;
        }
        if (typeof options.pingInterval !== 'number' || options.pingInterval < 0) {
            options.pingInterval = 20;
        }
        if (typeof options.pingTimeout !== 'number' || options.pingTimeout < 0) {
            options.pingTimeout = 5;
        }

        const promisesNet = [];
        for (const [net, hosts] of Object.entries(nets)) {
            const promisesHosts = [];

            const netPath = path.normalize(`${resultPath}/${net}`);
            await mkdirSafe(netPath);

            const tap = serverTapNets[net];
            promisesHosts.push(Promise.all([
                tinc.generateTincPublicKey(netPath, tap),
                tinc.generateTincPrivateKey(netPath, tap),
                tinc.generateTincConf(net, netPath, o.config._hostname, hosts, options),
            ]).then(() => debug(`${net}: config and keys: done`)));

            promisesHosts.push(Promise.all([
                tinc.generateTincUpHook(netPath, tap),
                tinc.generateTincDownHook(netPath, tap),
                tinc.generateHostUpHook(netPath, tap),
                tinc.generateHostDownHook(netPath, tap),
                tinc.generateSubnetUpHook(netPath, tap, options.mode || undefined),
                tinc.generateSubnetDownHook(netPath, tap, options.mode || undefined),
                tinc.generateRoutesScript(netPath, tap),
            ]).then(() => debug(`${net}: hooks: done`)));

            const hostsPath = path.normalize(`${netPath}/hosts`);
            await mkdirSafe(hostsPath);

            const remoteSet = new Set();
            for (const v of o.config.parser.servers.list) {
                if (v.source.net && v.source?.lan?.ip && v.location !== o.config.parser.server.location && intersects(myZone, [v.location.zone ?? ''].flat())) {
                    remoteSet.add(`${v.source.lan.ip}`);
                }
            }
            const remotePath = path.normalize(`${netPath}/routes-remote`);
            const remoteData = Array.from(remoteSet).join('\n');
            promisesHosts.push(fs.writeFile(remotePath, remoteData).then(() => debug(`${net}: routes-remote: done`)));

            for (const [key, item] of Object.entries(hosts)) {
                const vm = o.config.servers[key];
                const location = o.config.parser.locations.map[vm.location];
                const address = key;
                const serverTap = getTapsSafe(item.tap).find((x) => x.name === net);

                if (!serverTap.key || serverTap.key.includes(', hash:')) {
                    continue;
                }

                let hostFile = '';
                if (!vm.wan && location.wan3 && vm.tcpShift) {
                    const port = 3 + (vm.tcpShift | 0);
                    for (const address of [].concat(location.wan3)) {
                        hostFile += `Address = ${address}${port ? ` ${port}` : ''}\n`;
                    }
                } else {
                    hostFile += `Address = ${address}\n`;
                }
                hostFile += '# myself\n';
                hostFile += `Subnet = ${serverTap.ip}/32\n`;
                for (const v of o.config.parser.servers.list) {
                    if (v.source.net && v.source?.lan?.ip && v.location.key === item.location) {
                        hostFile += `# ${v.key}\n`;
                        hostFile += `Subnet = ${v.source.lan.ip}/32\n`;
                    }
                }

                hostFile += `Compression = ${options.compression}\n`;
                hostFile += `\n${serverTap.key}\n`;
                const hostPath = path.normalize(`${hostsPath}/${key.replace(/[-.]/gi, '_')}`);
                promisesHosts.push(fs.writeFile(hostPath, hostFile).then(() => debug(`${net}: host=${key}, ip=${serverTap.ip}: done`)));
            }
            promisesNet.push(Promise.all(promisesHosts).then(() => debug(`${net}: done`)));
        }
        return Promise.all(promisesNet).then(() => debug('done'));
    },
    generateTincUpHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -p "local7.info" -t "tinc.${item.name}[$PPID]" "tinc-up, name=$NAME, iface=$INTERFACE"\n`;
        output += `ifconfig $INTERFACE ${item.ip} netmask ${item.mask || '255.255.0.0'}\n`;
        output += 'ifconfig $INTERFACE up\n';
        output += `if ifconfig ${item.name} 2>/dev/null; then\n`;
        output += '    RAND=$(od -A n -t d -N 1 /dev/random)\n';
        output += `    ifconfig ${item.name} name ${item.name}-$RAND\n`;
        output += `    ifconfig ${item.name}-$RAND down\n`;
        output += `    for ITEM in $(netstat -rn | grep ${item.name}-$RAND | cut -d' ' -f1); do\n`;
        output += `        route delete $ITEM -interface ${item.name}-$RAND\n`;
        output += '    done\n';
        output += `    ifconfig ${item.name}-$RAND destroy &\n`;
        output += 'fi\n';
        output += `ifconfig $INTERFACE name ${item.name}\n`;
        if (Array.isArray(item.vip) && item.vip.length > 0) {
            for (let i = 0, till = item.vip.length; i < till; i++) {
                const vip = item.vip[i];
                if (typeof vip === 'object' && typeof vip.ip === 'string') {
                    output += `ifconfig ${item.name} vhid ${i + 1} advbase ${vip.advbase || 1} advskew ${vip.advskew || 1} pass ${item.name}-${i + 1} alias ${vip.ip}/32\n`;
                }
            }
        }
        output += `#route add -net 224.0.0.0/4 -interface ${item.name} || echo 'multicast route already exists'\n`;
        output += 'DIR=$(dirname -- "$(readlink -f -- "$0";)")\n';
        output += '[ -d "$DIR/routes" ] && rm -rdf "$DIR/routes"\n';
        return fs.writeFile(path.normalize(`${netPath}/tinc-up`), output);
    },
    generateTincDownHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -p "local7.info" -t "tinc.${item.name}[$PPID]" "tinc-down, name=$NAME, iface=$INTERFACE"\n`;
        if (Array.isArray(item.vip) && item.vip.length > 0) {
            for (let i = 0, till = item.vip.length; i < till; i++) {
                const vip = item.vip[i];
                if (typeof vip === 'object' && typeof vip.ip === 'string') {
                    output += `ifconfig ${item.name} vhid ${i + 1} state backup\n`;
                }
            }
        }
        output += `if ifconfig ${item.name} 2>/dev/null; then\n`;
        output += '    RAND=$(od -A n -t d -N 1 /dev/random | tr -d \' \')\n';
        output += `    ifconfig ${item.name} name ${item.name}-$RAND\n`;
        output += `    ifconfig ${item.name}-$RAND down\n`;
        output += `    ifconfig ${item.name}-$RAND destroy &\n`;
        output += 'fi\n';
        output += 'if ifconfig $INTERFACE 2>/dev/null; then\n';
        output += '    ifconfig $INTERFACE down\n';
        output += '    ifconfig $INTERFACE destroy &\n';
        output += 'fi\n';
        return fs.writeFile(path.normalize(`${netPath}/tinc-down`), output);
    },
    generateHostUpHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -p "local7.info" -t "tinc.${item.name}[$PPID]" "host-up, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT"\n`;
        return fs.writeFile(path.normalize(`${netPath}/host-up`), output);
    },
    generateHostDownHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -p "local7.info" -t "tinc.${item.name}[$PPID]" "host-down, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT"\n`;
        return fs.writeFile(path.normalize(`${netPath}/host-down`), output);
    },

    generateRoutesScript(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += 'DIR=$(dirname -- "$(readlink -f -- "$0";)")\n';
        output += `NETSTAT_CURRENT=$(netstat -rn | grep -e 'UHS.*${item.name}' | cut -d' ' -f1)\n`;
        output += 'mkdir -p $DIR/routes\n';
        output += 'ROUTES=$(ls $DIR/routes)\n';
        output += 'ROUTES_REMOTE=$(cat $DIR/routes-remote)\n';
        output += 'for ITEM in $ROUTES; do\n';
        output += '    IP=$(echo $ITEM | cut -d= -f2 | cut -d, -f1)\n';
        output += '    MASK=$(echo $ITEM | cut -d= -f3)\n';
        output += '    echo $ROUTES_REMOTE | grep -q $IP || continue\n';
        output += '    echo $NETSTAT_CURRENT | grep -q $IP && continue\n';
        output += `    route add "$IP/$MASK" -interface ${item.name}\n`;
        output += 'done\n';
        output += 'for IP in $NETSTAT_CURRENT; do\n';
        output += `    echo $ROUTES | grep -q $IP || route delete $IP -interface ${item.name}\n`;
        output += 'done\n';
        return fs.writeFile(path.normalize(`${netPath}/routes.sh`), output);
    },
    generateSubnetUpHook(netPath, item, mode = 'switch') {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -p "local7.info" -t "tinc.${item.name}[$PPID]" "subnet-up, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT, subnet=$SUBNET, weight=$WEIGHT"\n`;
        if (mode === 'router') {
            output += 'DIR=$(dirname -- "$(readlink -f -- "$0";)")\n';
            output += 'if [ "$REMOTEADDRESS" ]; then\n';
            output += '    IP=${SUBNET%/*}\n';
            output += '    MASK=${SUBNET#*/}\n';
            output += '    ROUTEDIR="$DIR/routes/ip=${IP},mask=${MASK}"\n';
            output += '    mkdir -p $ROUTEDIR\n';
            output += '    touch $ROUTEDIR/$REMOTEADDRESS\n';
            output += 'fi\n';
            output += '/bin/sh $DIR/routes.sh\n';
        }
        return fs.writeFile(path.normalize(`${netPath}/subnet-up`), output);
    },
    generateSubnetDownHook(netPath, item, mode = 'switch') {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -p "local7.info" -t "tinc.${item.name}[$PPID]" "subnet-down, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT, subnet=$SUBNET, weight=$WEIGHT"\n`;
        if (mode === 'router') {
            output += 'DIR=$(dirname -- "$(readlink -f -- "$0";)")\n';
            output += 'if [ "$REMOTEADDRESS" ]; then\n';
            output += '    IP=${SUBNET%/*}\n';
            output += '    MASK=${SUBNET#*/}\n';
            output += '    ROUTEDIR="$DIR/routes/ip=$IP,mask=$MASK"\n';
            output += '    [ -f "$ROUTEDIR/$REMOTEADDRESS" ] && rm "$ROUTEDIR/$REMOTEADDRESS"\n';
            output += '    [ "0" = "$(ls $ROUTEDIR | wc -l | tr -d \' \')" ] && rm -rdf $ROUTEDIR \n';
            output += 'fi\n';
            output += '/bin/sh $DIR/routes.sh\n';
        }
        return fs.writeFile(path.normalize(`${netPath}/subnet-down`), output);
    },
    generateTincConf(net, netPath, hostname, hosts, options) {
        let output = '';
        output += `Name = ${hostname.replace(/[-.]/gi, '_')}\n`;
        output += `Mode = ${options.mode || 'switch'}\n`;
        output += 'ProcessPriority = high\n';
        output += 'Device = /dev/tap\n';
        output += `GraphDumpFile = /root/${net}.graph\n`;
        output += `PingInterval = ${options.pingInterval}\n`;
        output += `PingTimeout = ${options.pingTimeout}\n`;

        for (const key of Object.keys(hosts)) {
            if (hostname === key) {
                continue;
            }
            output += `ConnectTo = ${key.replace(/[-.]/gi, '_')}\n`;
        }
        return fs.writeFile(path.normalize(`${netPath}/tinc.conf`), output);
    },
    generateTincPublicKey(netPath, item) {
        if (typeof item.key === 'string' && !item.key.includes(', hash:')) {
            return fs.writeFile(path.normalize(`${netPath}/rsa_key.pub`), item.key);
        }
        return Promise.resolve();
    },
    generateTincPrivateKey(netPath, item) {
        if (typeof item.keyPrivate === 'string' && !item.keyPrivate.includes(', hash:')) {
            return fs.writeFile(path.normalize(`${netPath}/rsa_key.priv`), item.keyPrivate);
        }
        return Promise.resolve();
    },
};

module.exports = tinc;
