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
            if (typeof server.router === 'string' && server.tap && server.tap.ip) {
                const hosts = nets[server.tap.name] || {};
                hosts[key] = server.tap;
                nets[server.tap.name] = hosts;
            }
        }

        const options = config.routing.options && typeof config.routing.options.tinc === 'object' ? config.routing.options.tinc : {};
        if (typeof options.compression !== 'number' || options.compression < 0 || options.compression > 9) {
            options.compression = 7;
        }

        for (const [net, hosts] of Object.entries(nets)) {
            const netPath = path.normalize(`${resultPath}/${net}`);
            await mkdirSafe(netPath);

            const hostsPath = path.normalize(`${netPath}/hosts`);
            await mkdirSafe(hostsPath);

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
                hostFile += `Subnet = ${item.ip}/32\n`;
                hostFile += `Compression = ${options.compression}\n`;
                if (item.key) {
                    hostFile += `\n${item.key}\n`;
                }
                await fs.writeFile(path.normalize(`${hostsPath}/${key.replace(/[-.]/gi, '_')}`), hostFile);
                debug(`hosts: ${key}: net=${net}, ip=${item.ip}: done`);
            }

            if (config._hostConfig.tap) {
                await tinc.generateTincUpHook(netPath, config._hostConfig.tap);
                await tinc.generateTincDownHook(netPath, config._hostConfig.tap);
                await tinc.generateHostUpHook(netPath, config._hostConfig.tap);
                await tinc.generateHostDownHook(netPath, config._hostConfig.tap);
                await tinc.generateSubnetUpHook(netPath, config._hostConfig.tap);
                await tinc.generateSubnetDownHook(netPath, config._hostConfig.tap);
                debug('hooks: done');
            }

            await tinc.generateTincPublicKey(netPath, config._hostConfig.tap);
            await tinc.generateTincPrivateKey(netPath, config._hostConfig.tap);
            await tinc.generateTincConfHook(net, netPath, hosts);
        }
        debug('done');
    },
    generateTincUpHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "tinc-up, name=$NAME, iface=$INTERFACE"\n`;
        output += `ifconfig $INTERFACE ${item.ip} netmask ${item.mask || "255.255.0.0"}\n`;
        output += 'ifconfig $INTERFACE up\n';
        output += `ifconfig $INTERFACE name ${item.name}\n`;
        if (Array.isArray(item.vip) && item.vip.length) {
            for (let i = 0, till = item.vip.length; i < till; i++) {
                const vip = item.vip[i];
                if (typeof vip === 'object' && typeof vip.ip === 'string') {
                    output += `ifconfig ${item.name} vhid ${i + 1} advbase ${vip.advbase || 1} advskew ${vip.advskew || 1} pass ${item.name}-${i + 1} alias ${vip.ip}/32\n`;
                }
            }
        }
        output += `#route add -net 224.0.0.0/4 -interface ${item.name} || echo 'route already exists'\n`;
        return fs.writeFile(path.normalize(`${netPath}/tinc-up`), output);
    },
    generateTincDownHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "tinc-down, name=$NAME, iface=$INTERFACE"\n`;
		/**
        if (Array.isArray(item.vip) && item.vip.length) {
            for (let i = 0, till = item.vip.length; i < till; i++) {
                const vip = item.vip[i];
                if (typeof vip === 'object' && typeof vip.ip === 'string') {
                    output += `ifconfig ${item.name} vhid ${i + 1} state backup\n`;
                }
            }
        }
		**/
        output += `ifconfig ${item.name} destroy &\n`;
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
    generateSubnetUpHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "subnet-up, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT, subnet=$SUBNET, weight=$WEIGHT"\n`;
        return fs.writeFile(path.normalize(`${netPath}/subnet-up`), output);
    },
    generateSubnetDownHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "subnet-down, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT, subnet=$SUBNET, weight=$WEIGHT"\n`;
        return fs.writeFile(path.normalize(`${netPath}/subnet-down`), output);
    },
    generateTincConfHook(net, netPath, hosts) {
        let output = '';
        output += `Name = ${config._hostname.replace(/[-.]/gi, '_')}\n`;
        output += 'Mode = switch\n';
        output += 'ProcessPriority = high\n';
        output += 'Device = /dev/tap\n';
        output += `GraphDumpFile = /root/${net}.graph\n`;

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
