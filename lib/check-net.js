var net = require('net');

module.exports = function (host, port, callback) {
    var result;
    var key = host + ':' + port;

    var s = new net.Socket();
    s.setNoDelay();

    function setError(reason) {
        result = {
            type: 'closed',
            date: new Date(),
            host: host,
            port: port,
            reason: reason
        };
        s.destroy();
    }

    s.on('close', function (data) {
        callback && callback(null, result);
    });

    s.setTimeout(5000, setError.bind(null, 'timeout'));
    s.on('error', function (error) {
        setError(error.code);
    });

    s.connect(port, host, function () {
        result = {
            type: 'opened',
            date: new Date(),
            host: host,
            port: port
        };
        s.destroy();
    });
}
