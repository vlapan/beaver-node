var exec = require('child_process').exec;

var script = "for ITEM in `ifconfig -l`; do MAC=`ifconfig $ITEM | grep -o -E '([[:xdigit:]]{1,2}:){5}[[:xdigit:]]{1,2}'`;if [ ! -z \"$MAC\" ]; then echo $ITEM=$MAC;fi; done;";

module.exports = function (callback) {
	exec(script, function (error, stdout, stderr) {
		if (error) {
			callback(error);
			process.exit();
		}
		var array = [];
		var data = stdout.split('\n');
		data.forEach(function(string) {
			var item = string.split('=');
			if (!item[0] || !item[1]) {
				return;
			}
			array.push({
				name: item[0],
				mac_address: item[1]
			});
		});
		callback(null, array);
	});
};
