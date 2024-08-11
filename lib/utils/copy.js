const fs = require('node:fs');

module.exports = function (source, target, cb) {
    let cbCalled = false;

    const rd = fs.createReadStream(source);
    rd.on('error', done);

    const wr = fs.createWriteStream(target);
    wr.on('error', done);
    wr.on('close', function (ex) {
        done();
    });
    rd.pipe(wr);

    function done(err) {
        if (!cbCalled) {
            cb(err);
            cbCalled = true;
        }
    }
};
