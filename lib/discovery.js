const os = require('os');
const ip = require('ip');

const argv = require(`./argv`);

const mdns = require('multicast-dns')({
    multicast: true, // use udp multicasting
    // interface: '', // explicitly specify a network interface. defaults to all
    port: 8001, // set the udp port
    ip: '224.0.0.251', // set the udp ip
    ttl: 255, // set the multicast ttl
    loopback: true, // receive your own packets
    reuseAddr: true // set the reuseAddr option when creating the socket (requires node >=0.11.13)
});

const serviceKey = 'beaver-http';
const peers = {};

let heartBeatTimer;

function heartBeat() {
    clearTimeout(heartBeatTimer);
    anounce();
    Object.keys(peers).forEach(function (key) {
        const peer = peers[key];
        if ((new Date()) - peer.lastSeen > 5 * 1000) {
            delete peers[key];
        }
    });
    heartBeatTimer = setTimeout(heartBeat, 1000);
}
heartBeatTimer = setTimeout(heartBeat, 1000);


mdns.on('response', function (response) {
    const {data} = response.answers[0];
    data.lastSeen = new Date();
    const split = data.target.split('|');
    const peerKey = split[0];
    const addresses = split[1];
    data.target = addresses;
    if (data.port === argv.httpsPort) {
        data.port = null;
    }
    peers[peerKey] = data;
    // console.log();
    // console.log(JSON.stringify(peers, null, 4));
    // console.log('got a response packet:', JSON.stringify(response.answers[0], null, 4));
    // console.log('got a response packet:', JSON.stringify(response, null, 4));
});

function getAddresses() {
    let addrInfo; let ifaceDetails;
    const ips = {};
    const networkInterfaces = os.networkInterfaces();
    for (const ifaceName in networkInterfaces) {
        ifaceDetails = networkInterfaces[ifaceName];
        for (let i = 0, till = ifaceDetails.length; i < till; i++) {
            addrInfo = ifaceDetails[i];
            if (addrInfo.family === 'IPv4') {
                ips[addrInfo.address] = true;
            }
        }
    }
    return Object.keys(ips).filter(function (item) {
        return item !== '127.0.0.1';
    }).sort(function (a, b) {
        if (ip.isPrivate(a) && !ip.isPrivate(b)) {
            return 1;
        } if (!ip.isPrivate(a) && ip.isPrivate(b)) {
            return -1;
        }
        return ip.toLong(a) - ip.toLong(b);
    }).toString();
}

function anounce() {
    mdns.respond({
        answers: [{
            name: serviceKey,
            type: 'SRV',
            data: {
                target: `${argv.hostname  }|${  getAddresses()}`,
                port: argv.httpsPort,
            }
        }]
    });
}

mdns.on('query', function (query) {
    if (query.questions[0] && query.questions[0].name === serviceKey) {
        anounce();
    }
});

mdns.query({
    questions: [{
        name: serviceKey,
        type: 'SRV'
    }]
});

module.exports = function getPeers() {
    return peers;
};
