const fs = require('fs');
const path = require('path');

const config = require(`${__dirname}/../../configuration`);
const logger = require(`${__dirname}/../../logger`);

const tinc = {
    generate(callback) {
        logger.log('info', '======================================================================');
        logger.log('info', 'TINC configuration generation');
        logger.log('info', '----------------------------------------------------------------------');

        const resultPath = path.normalize(`${config._outputPath}/tinc`);
        if (!fs.existsSync(resultPath)) {
            fs.mkdirSync(resultPath);
        }

        const nets = {};

        function addHost(item) {
            if (item.tap && item.tap.ip) {
                let hosts = nets[item.tap.name];
                if (!hosts) {
                    hosts = nets[item.tap.name] = {};
                }
                hosts[item.key] = item.tap;
            }
        }

        for (const [key, server] of Object.entries(config.servers)) {
            if (typeof server.router === 'string') {
                const item = server;
                item.key = key;
                addHost(item);
            }
        }

        const options = config.routing.options && typeof config.routing.options.tinc === 'object' ? config.routing.options.tinc : {};
        if (typeof options.compression !== 'number' || options.compression < 0 || options.compression > 9) {
            options.compression = 7;
        }

        for (const [net, hosts] of Object.entries(nets)) {
            const netPath = path.normalize(`${resultPath}/${net}`);
            if (!fs.existsSync(netPath)) {
                fs.mkdirSync(netPath);
            }

            const hostsPath = path.normalize(`${netPath}/hosts`);
            if (!fs.existsSync(hostsPath)) {
                fs.mkdirSync(hostsPath);
            }

            for (const [key, item] of Object.entries(hosts)) {
                const vm = config.servers[key];
                const location = config.parser.locations.map[vm.location];
                const address = key;
                logger.log('debug', `"${key}" host, net: ${net}, ip: ${item.ip}`);

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
                fs.writeFileSync(path.normalize(`${hostsPath}/${key.replace(/[\-\.]/gi, '_')}`), hostFile, 'UTF-8');
            }

            if (config._hostConfig.tap) {
                tinc.generateTincUpHook(netPath, config._hostConfig.tap);
                tinc.generateTincDownHook(netPath, config._hostConfig.tap);
                tinc.generateHostUpHook(netPath, config._hostConfig.tap);
                tinc.generateHostDownHook(netPath, config._hostConfig.tap);
                tinc.generateSubnetUpHook(netPath, config._hostConfig.tap);
                tinc.generateSubnetDownHook(netPath, config._hostConfig.tap);
            }

            tinc.generateTincPublicKey(netPath, config._hostConfig.tap);
            tinc.generateTincPrivateKey(netPath, config._hostConfig.tap);
            tinc.generateTincConfHook(net, netPath, hosts);
        }

        if (typeof callback === 'function') {
            callback(null, true);
        }
    },
    generateTincUpHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "tinc-up, name=$NAME, iface=$INTERFACE"\n`;
        output += `ifconfig $INTERFACE ${item.ip} netmask 255.255.0.0\n`;
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
        fs.writeFileSync(path.normalize(`${netPath}/tinc-up`), output, 'UTF-8');
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
        output += `ifconfig ${item.name} destroy\n`;
        fs.writeFileSync(path.normalize(`${netPath}/tinc-down`), output, 'UTF-8');
    },
    generateHostUpHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "host-up, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT"\n`;
        fs.writeFileSync(path.normalize(`${netPath}/host-up`), output, 'UTF-8');
    },
    generateHostDownHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "host-down, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT"\n`;
        fs.writeFileSync(path.normalize(`${netPath}/host-down`), output, 'UTF-8');
    },
    generateSubnetUpHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "subnet-up, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT, subnet=$SUBNET, weight=$WEIGHT"\n`;
        fs.writeFileSync(path.normalize(`${netPath}/subnet-up`), output, 'UTF-8');
    },
    generateSubnetDownHook(netPath, item) {
        let output = '';
        output += '#!/bin/sh\n';
        output += `logger -i -t "tinc.${item.name}" "subnet-down, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT, subnet=$SUBNET, weight=$WEIGHT"\n`;
        fs.writeFileSync(path.normalize(`${netPath}/subnet-down`), output, 'UTF-8');
    },
    generateTincConfHook(net, netPath, hosts) {
        let output = '';
        output += `Name = ${config._hostConfig.key.replace(/[-.]/gi, '_')}\n`;
        output += 'Mode = switch\n';
        output += 'ProcessPriority = high\n';
        output += 'Device = /dev/tap\n';
        output += `GraphDumpFile = /root/${net}.graph\n`;

        for (const key of Object.keys(hosts)) {
            if (config._hostConfig.key === key) {
                continue;
            }
            output += `ConnectTo = ${key.replace(/[\-\.]/gi, '_')}\n`;
        }
        fs.writeFileSync(path.normalize(`${netPath}/tinc.conf`), output, 'UTF-8');
    },
    generateTincPublicKey(netPath, item) {
        if (typeof item.key === 'string') {
            fs.writeFileSync(path.normalize(`${netPath}/rsa_key.pub`), item.key, 'UTF-8');
        }
    },
    generateTincPrivateKey(netPath, item) {
        if (typeof item.keyPrivate === 'string') {
            fs.writeFileSync(path.normalize(`${netPath}/rsa_key.priv`), item.keyPrivate, 'UTF-8');
        }
    },
};

module.exports = tinc;
