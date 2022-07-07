const fs = require('fs/promises');
const path = require('path');

const config = require('../../configuration');

const { mkdirSafe } = require('../../utils/fs');

const tinc = {
    async generate(o) {
        const debug = o.debug.extend('tinc');
        debug('start');

        const resultPath = path.normalize(`${config._outputPath}/tinc`);
        await mkdirSafe(resultPath);

        const nets = {};

        for (const [key, server] of Object.entries(config.servers)) {
            if (typeof server.router === 'string' && server?.tap?.ip) {
                const hosts = nets[server.tap.name] || {};
                hosts[key] = server;
                nets[server.tap.name] = hosts;
            }
        }

        const options = config.routing.options && typeof config.routing.options.tinc === 'object' ? config.routing.options.tinc : {};
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

            promisesHosts.push(Promise.all([
                tinc.generateTincPublicKey(netPath, config._hostConfig.tap),
                tinc.generateTincPrivateKey(netPath, config._hostConfig.tap),
                tinc.generateTincConfHook(net, netPath, hosts, options),
            ]));

            if (config._hostConfig.tap) {
                promisesHosts.push(Promise.all([
                    tinc.generateTincUpHook(netPath, config._hostConfig.tap),
                    tinc.generateTincDownHook(netPath, config._hostConfig.tap),
                    tinc.generateHostUpHook(netPath, config._hostConfig.tap),
                    tinc.generateHostDownHook(netPath, config._hostConfig.tap),
                    tinc.generateSubnetUpHook(netPath, config._hostConfig.tap, options.mode || undefined),
                    tinc.generateSubnetDownHook(netPath, config._hostConfig.tap, options.mode || undefined),
                ]).then(() => debug(`${net}: hooks done`)));
            }

            const hostsPath = path.normalize(`${netPath}/hosts`);
            await mkdirSafe(hostsPath);

            const remoteSet = new Set();
            config.parser.servers.list.forEach((v) => {
                if (v.source.net && v.source?.lan?.ip && v.location !== config.parser.server.location) {
                    remoteSet.add(`${v.source.lan.ip}`);
                }
            });
            const remotePath = path.normalize(`${netPath}/routes-remote`);
            const remoteData = Array.from(remoteSet).join('\n');
            promisesHosts.push(fs.writeFile(remotePath, remoteData).then(() => debug(`${net}: routes-remote: done`)));

            for (const [key, item] of Object.entries(hosts)) {
                const vm = config.servers[key];
                const location = config.parser.locations.map[vm.location];
                const address = key;

                let hostFile = '';
                if (!vm.wan && location.wan3 && vm.tcpShift) {
                    const port = 3 + (vm.tcpShift | 0);
                    for (const address of [].concat(location.wan3)) {
                        hostFile += `Address = ${address}${port ? ` ${port}` : ''}\n`;
                    }
                } else {
                    hostFile += `Address = ${address}\n`;
                }

                hostFile += `# myself\n`;
                hostFile += `Subnet = ${item.tap.ip}/32\n`;
                config.parser.servers.list.forEach((v) => {
                    if (v.source.net && v.source?.lan?.ip && v.location.key === item.location) {
                        hostFile += `# ${v.key}\n`;
                        hostFile += `Subnet = ${v.source.lan.ip}/32\n`;
                    }
                });

                hostFile += `Compression = ${options.compression}\n`;
                if (item.tap.key) {
                    hostFile += `\n${item.tap.key}\n`;
                }
                const hostPath = path.normalize(`${hostsPath}/${key.replace(/[-.]/gi, '_')}`);
                promisesHosts.push(fs.writeFile(hostPath, hostFile).then(() => debug(`${net}: host=${key}, ip=${item.tap.ip}: done`)));
            }
            promisesNet.push(Promise.all(promisesHosts).then(() => debug(`${net}: done`)));
        }
        return Promise.all(promisesNet).then(() => debug('done'));
    },
    generateTincUpHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "tinc-up, name=$NAME, iface=$INTERFACE"\n`;
        output += `ifconfig $INTERFACE ${item.ip} netmask ${item.mask || "255.255.0.0"}\n`;
        output += 'ifconfig $INTERFACE up\n';
        output += `ifconfig ${item.name} && ifconfig ${item.name} destroy\n`;
        output += `ifconfig $INTERFACE name ${item.name}\n`;
        if (Array.isArray(item.vip) && item.vip.length) {
            for (let i = 0, till = item.vip.length; i < till; i++) {
                const vip = item.vip[i];
                if (typeof vip === 'object' && typeof vip.ip === 'string') {
                    output += `ifconfig ${item.name} vhid ${i + 1} advbase ${vip.advbase || 1} advskew ${vip.advskew || 1} pass ${item.name}-${i + 1} alias ${vip.ip}/32\n`;
                }
            }
        }
        output += `#route add -net 224.0.0.0/4 -interface ${item.name} || echo 'multicast route already exists'\n`;
        output += `DIR=$(dirname -- "$(readlink -f -- "$0";)")\n`;
        output += '[ -d "$DIR/routes" ] && rm -rdf "$DIR/routes"';
        return fs.writeFile(path.normalize(`${netPath}/tinc-up`), output);
    },
    generateTincDownHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "tinc-down, name=$NAME, iface=$INTERFACE"\n`;
        if (Array.isArray(item.vip) && item.vip.length) {
            for (let i = 0, till = item.vip.length; i < till; i++) {
                const vip = item.vip[i];
                if (typeof vip === 'object' && typeof vip.ip === 'string') {
                    output += `ifconfig ${item.name} vhid ${i + 1} state backup\n`;
                }
            }
        }
        output += `ifconfig ${item.name} name ${item.name}-prev\n`;
        output += `ifconfig ${item.name}-prev destroy &\n`;
        return fs.writeFile(path.normalize(`${netPath}/tinc-down`), output);
    },
    generateHostUpHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "host-up, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT"\n`;
        return fs.writeFile(path.normalize(`${netPath}/host-up`), output);
    },
    generateHostDownHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "host-down, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT"\n`;
        return fs.writeFile(path.normalize(`${netPath}/host-down`), output);
    },

    generateRoutesScript(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `NETSTAT_CURRENT=$(netstat -rn | grep -e 'UHS.*${item.name}' | cut -d' ' -f1)\n`;
        output += `ROUTES=$(ls $DIR/routes)\n`;
        output += `ROUTES_REMOTE=$(cat $DIR/routes-remote)\n`;
        output += 'for ITEM in $ROUTES; do\n';
        output += '    IP=$(echo $ITEM | cut -d= -f2 | cut -d, -f1)\n';
        output += '    MASK=$(echo $ITEM | cut -d= -f3)\n';
        output += `    echo $ROUTES_REMOTE | grep -q $IP || continue\n`;
        output += `    echo $NETSTAT_CURRENT | grep -q $IP && continue\n`;
        output += `    route add "$IP/$MASK" -interface ${item.name}\n`;
        output += 'done\n';
        output += 'for IP in $NETSTAT_CURRENT; do\n';
        output += `    echo $ROUTES | grep -q $IP || route delete $IP -interface ${item.name}\n`;
        output += 'done\n';
        return output;
    },
    generateSubnetUpHook(netPath, item, mode = 'switch') {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "subnet-up, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT, subnet=$SUBNET, weight=$WEIGHT"\n`;
        if (mode === 'router') {
            output += `DIR=$(dirname -- "$(readlink -f -- "$0";)")\n`;
            output += 'if [ "$REMOTEADDRESS" ]; then\n';
            output += '    IP=${SUBNET%/*}\n';
            output += '    MASK=${SUBNET#*/}\n';
            output += '    ROUTEDIR="$DIR/routes/ip=${IP},mask=${MASK}"\n';
            output += '    mkdir -p $ROUTEDIR\n';
            output += '    touch $ROUTEDIR/$REMOTEADDRESS\n';
            output += 'fi\n';
            output += this.generateRoutesScript(netPath, item);
        }
        return fs.writeFile(path.normalize(`${netPath}/subnet-up`), output);
    },
    generateSubnetDownHook(netPath, item, mode = 'switch') {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "subnet-down, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT, subnet=$SUBNET, weight=$WEIGHT"\n`;
        if (mode === 'router') {
            output += `DIR=$(dirname -- "$(readlink -f -- "$0";)")\n`;
            output += 'if [ "$REMOTEADDRESS" ]; then\n';
            output += '    IP=${SUBNET%/*}\n';
            output += '    MASK=${SUBNET#*/}\n';
            output += '    ROUTEDIR="$DIR/routes/ip=$IP,mask=$MASK"\n';
            output += '    [ -f "$ROUTEDIR/$REMOTEADDRESS" ] && rm "$ROUTEDIR/$REMOTEADDRESS"\n';
            output += `    [ "0" = "$(ls $ROUTEDIR | wc -l | tr -d ' ')" ] && rm -rdf $ROUTEDIR \n`;
            output += 'fi\n';
            output += this.generateRoutesScript(netPath, item);
        }
        return fs.writeFile(path.normalize(`${netPath}/subnet-down`), output);
    },
    generateTincConfHook(net, netPath, hosts, options) {
        let output = '';
        output += `Name = ${config._hostname.replace(/[-.]/gi, '_')}\n`;
        output += `Mode = ${options.mode || 'switch'}\n`;
        output += 'ProcessPriority = high\n';
        output += 'Device = /dev/tap\n';
        output += `GraphDumpFile = /root/${net}.graph\n`;
        output += `PingInterval = ${options.pingInterval}\n`;
        output += `PingTimeout = ${options.pingTimeout}\n`;

        for (const key of Object.keys(hosts)) {
            if (config._hostname === key) {
                continue;
            }
            output += `ConnectTo = ${key.replace(/[-.]/gi, '_')}\n`;
        }
        return fs.writeFile(path.normalize(`${netPath}/tinc.conf`), output);
    },
    generateTincPublicKey(netPath, item) {
        if (typeof item.key === 'string') {
            return fs.writeFile(path.normalize(`${netPath}/rsa_key.pub`), item.key);
        }
        return Promise.resolve();
    },
    generateTincPrivateKey(netPath, item) {
        if (typeof item.keyPrivate === 'string') {
            return fs.writeFile(path.normalize(`${netPath}/rsa_key.priv`), item.keyPrivate);
        }
        return Promise.resolve();
    },
};

module.exports = tinc;
