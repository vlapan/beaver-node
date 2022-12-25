const net = require('net');

function checknet(host, port, callback) {
    let result;

    const s = new net.Socket();
    s.setNoDelay();

    function setError(reason) {
        result = {
            type: 'closed',
            date: new Date(),
            host,
            port,
            reason,
        };
        s.destroy();
    }

    s.on('close', () => {
        if (typeof callback === 'function') {
            callback(null, result);
        }
    });

    s.setTimeout(1000, setError.bind(null, 'timeout'));
    s.on('error', (error) => {
        setError(error.code);
    });

    s.connect(port, host, () => {
        result = {
            type: 'opened',
            date: new Date(),
            host,
            port,
        };
        s.destroy();
    });
}

module.exports = checknet;
