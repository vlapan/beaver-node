const { exec } = require('node:child_process');

const script = 'for ITEM in `ifconfig -l`; do MAC=`ifconfig $ITEM | grep -o -E \'([[:xdigit:]]{1,2}:){5}[[:xdigit:]]{1,2}\'`;if [ ! -z "$MAC" ]; then echo $ITEM=$MAC;fi; done;';

function processInterfaces(callback, error, stdout, stderr) {
    if (error) {
        callback(error);
        process.exit();
    }
    const array = [];
    const data = stdout.split('\n');
    data.forEach(function (string) {
        const item = string.split('=');
        if (!item[0] || !item[1]) {
            return;
        }
        array.push({
            name: item[0],
            mac_address: item[1],
        });
    });
    callback(null, array);
}

module.exports = function (callback) {
    exec(script, processInterfaces.bind(null, callback));
};
