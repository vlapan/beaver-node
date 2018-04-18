const fs = require('fs');
const path = require('path');

const config = require(`${__dirname}/../../configuration`);
const logger = require(`${__dirname}/../../logger`);

module.exports = {
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
                hostFile += 'Compression = 7\n';
                if (item.key) {
                    hostFile += `\n${item.key}\n`;
                }
                fs.writeFileSync(path.normalize(`${hostsPath}/${key.replace(/[\-\.]/gi, '_')}`), hostFile, 'UTF-8');
            }

            function generateTincUpHook(item) {
                let output = '';
                output += '#!/bin/sh\n';
                output += `logger -i -t "tinc.${item.name}" "tinc-up, name=$NAME, iface=$INTERFACE"\n`;
                output += `ifconfig $INTERFACE ${item.ip} netmask 255.255.0.0\n`;
                output += 'ifconfig $INTERFACE up\n';
                output += `ifconfig $INTERFACE name ${item.name}\n`;
                output += `#route add -net 224.0.0.0/4 -interface ${item.name} || echo 'route already exists'\n`;
                fs.writeFileSync(path.normalize(`${netPath}/tinc-up`), output, 'UTF-8');
            }

            function generateTincDownHook(item) {
                let output = '';
                output += '#!/bin/sh\n';
                output += `logger -i -t "tinc.${item.name}" "tinc-down, name=$NAME, iface=$INTERFACE"\n`;
                output += `ifconfig ${item.name} destroy\n`;
                fs.writeFileSync(path.normalize(`${netPath}/tinc-down`), output, 'UTF-8');
            }

            function generateHostUpHook(item) {
                let output = '';
                output += '#!/bin/sh\n';
                output += `logger -i -t "tinc.${item.name}" "host-up, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT"\n`;
                fs.writeFileSync(path.normalize(`${netPath}/host-up`), output, 'UTF-8');
            }

            function generateHostDownHook(item) {
                let output = '';
                output += '#!/bin/sh\n';
                output += `logger -i -t "tinc.${item.name}" "host-down, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT"\n`;
                fs.writeFileSync(path.normalize(`${netPath}/host-down`), output, 'UTF-8');
            }

            function generateSubnetUpHook(item) {
                let output = '';
                output += '#!/bin/sh\n';
                output += `logger -i -t "tinc.${item.name}" "subnet-up, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT, subnet=$SUBNET, weight=$WEIGHT"\n`;
                fs.writeFileSync(path.normalize(`${netPath}/subnet-up`), output, 'UTF-8');
            }

            function generateSubnetDownHook(item) {
                let output = '';
                output += '#!/bin/sh\n';
                output += `logger -i -t "tinc.${item.name}" "subnet-down, iface=$INTERFACE, node=$NODE, remoteaddress=$REMOTEADDRESS, remoteport=$REMOTEPORT, subnet=$SUBNET, weight=$WEIGHT"\n`;
                fs.writeFileSync(path.normalize(`${netPath}/subnet-down`), output, 'UTF-8');
            }
            if (config._hostConfig.tap) {
                generateTincUpHook(config._hostConfig.tap);
                generateTincDownHook(config._hostConfig.tap);
                generateHostUpHook(config._hostConfig.tap);
                generateHostDownHook(config._hostConfig.tap);
                generateSubnetUpHook(config._hostConfig.tap);
                generateSubnetDownHook(config._hostConfig.tap);
            }

            function generateTincConfHook() {
                let output = '';
                output += `Name = ${config._hostConfig.key.replace(/[-.]/gi, '_')}\n`;
                output += 'Mode = switch\n';
                output += 'ProcessPriority = high\n';
                output += 'Device = /dev/tap\n';

                for (const key of Object.keys(hosts)) {
                    if (config._hostConfig.key === key) {
                        continue;
                    }
                    output += `ConnectTo = ${key.replace(/[\-\.]/gi, '_')}\n`;
                }
                fs.writeFileSync(path.normalize(`${netPath}/tinc.conf`), output, 'UTF-8');
            }
            generateTincConfHook();
        }

        if (typeof callback === 'function') {
            callback(null, true);
        }
    },
};
