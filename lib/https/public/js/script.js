var checkRequests = {};
var peersDiscovered = {};
var peersConfig = {};
var config;

function parse(data) {
	peersConfig = {};

	config = yaumnrc.parse(data);
	var servers = data.servers || {};

	if (data.test) {
		Object.keys(data.test).forEach(function (key) {
			servers[key] = data.test[key];
		});
	}

	Object.keys(servers).filter(function (key) {
		var item = servers[key];
		return item.router;
	}).forEach(function (key) {
		var vm = servers[key];
		if (!peersConfig[key]) {
			peersConfig[key] = [];
		}
		if (vm.wan && vm.wan.ip) {
			peersConfig[key].push({
				ip: vm.wan.ip,
				source: 'config'
			});
		}
		var wan3 = config.locations.map[vm.location].wan3;
		if (wan3 && vm.tcpShift) {
			peersConfig[key].push({
				ip: [].concat(wan3)[0],
				port: (2 + (vm.tcpShift | 0)),
				source: 'config'
			});
		}
	});
	drawPeers();
}

function drawPeers() {
	var merged = {};

	Object.keys(peersDiscovered).forEach(function (key) {
		var item = peersDiscovered[key];
		if (!merged[key]) {
			merged[key] = [];
		}
		merged[key] = merged[key].concat(item);
	});

	Object.keys(peersConfig).forEach(function (key) {
		var item = peersConfig[key];
		if (!merged[key]) {
			merged[key] = [];
		}
		merged[key] = merged[key].concat(item);
	});

	var hosts = [];
	var hostname = document.querySelector('.hostname').innerHTML;
	Object.keys(merged).sort().forEach(function (key) {
		hosts.push({
			key: key,
			self: key === hostname,
			addresses: merged[key]
		});
	});
	var formElement = document.querySelector('form');
	var hostsBlock = formElement.querySelector('.hosts');
	hostsBlock.innerHTML = window.puglatizer.hosts({
		hosts: hosts
	});
	checkPeers();
}

var peersXHR;
function requestPeers() {
	if (peersXHR) {
		peersXHR.abort();
	}
	peersXHR = $.getJSON('/peers', function (data) {
		peersDiscovered = {};
		Object.keys(data).forEach(function (key) {
			var item = data[key];
			var addresses = item.target.split(',').map(function (address) {
				return {
					ip: address,
					port: item.port,
					source: 'discovery'
				};
			});
			peersDiscovered[key] = addresses;
		});
		drawPeers();
	}, 'json').fail(function (jqXHR, textStatus, errorThrown) {
		console.log('request peers, error:', textStatus, errorThrown);
	});
}

function checkPeers() {
	var formElement = document.querySelector('form');
	var hostsBlock = formElement.querySelector('.hosts');
	[].forEach.call(hostsBlock.querySelectorAll('.host .address'), function (host) {
		var ip = host.getAttribute('ip');
		if (!ip) {
			host.title = 'Loading...';
			host.style.color = '#00c';
			return;
		}
		if (checkRequests[host.innerHTML]) {
			checkRequests[host.innerHTML].abort();
		}
		checkRequests[host.innerHTML] = $.post('/check-net', {
			host: ip,
			port: host.getAttribute('port')
		}, function (data) {
			var input = host.querySelector('input');
			if (data.reason) {
				host.title = data.reason;
				host.style.color = '#c00';
				host.classList.remove('success');
				input.checked = false;
				input.disabled = true;
			} else {
				host.title = 'READY';
				host.style.color = '#0c0';
				host.classList.add('success');
				input.checked = true;
				input.disabled = false;
			}
		}, 'json').fail(function (err) {
			console.log('request check, error:', err)
		});
	});
}

document.addEventListener('DOMContentLoaded', function (event) {
	requestPeers();

	var formElement = document.querySelector('form');
	var configInputElement = formElement.querySelector('input[name="config"]');

	var editor = ace.edit("editor");
	editor.setTheme("ace/theme/twilight");
	editor.session.setMode("ace/mode/json");
	if (configInputElement.value) {
		editor.setValue(configInputElement.value);
	}
	editor.focus();
	var changeTimer;
	editor.on("change", function (event) {
		try {
			var data = JSON.parse(editor.getValue());
			clearTimeout(changeTimer);
			changeTimer = setTimeout(parse.bind(null, data), 1000);
		} catch (e) {
			// console.log(e);
		}
	});
	editor.session.on("changeAnnotation", function () {
		var annotations = editor.session.getAnnotations();
		var errorsBlock = formElement.querySelector('.errors');
		if (!editor.getValue()) {
			errorsBlock.innerHTML = 'Empty';
		} else {
			if (annotations.length) {
				errorsBlock.innerHTML = annotations[0].text;
				if (annotations.length > 1) {
					errorsBlock.innerHTML += ' (' + (annotations.length - 1) + ' more)';
				}
			} else {
				errorsBlock.innerHTML = '';
			}
		}
		var submitButton = formElement.querySelector('input[name="submit"]');
		if (!submitButton) {
			return;
		}
		submitButton.disabled = !!annotations.length || !editor.getValue();
		var explainButton = formElement.querySelector('input[name="explain"]');
		explainButton.disabled = !!annotations.length || !editor.getValue();
		explainButton.onclick = function (e) {
			e.preventDefault();
			var div = document.createElement('div');
			div.className = 'popup';
			explainer.makeExplainer(div, config);
			div.children[0].style.backgroundColor = '#fff';
			document.body.appendChild(div);
			return false;
		};
	});

	formElement.addEventListener('submit', function (event) {
		configInputElement.value = editor.getValue();
	});

	var recheckButton = formElement.querySelector('.btn-recheck');
	recheckButton.addEventListener('click', function (event) {
		event.preventDefault();
		requestPeers();
		// drawPeers();
		return false;
	});

	var buttonsBlock = formElement.querySelector('.buttons');
	buttonsBlock.addEventListener('click', function (event) {
		event.preventDefault();

		if (event.target.tagName !== 'BUTTON') {
			return;
		}

		var hosts = formElement.querySelectorAll('.host input[name="forward"]');
		switch (event.target.className) {
		case 'all':
			for (var i = 0, till = hosts.length; i < till; i++) {
				if (hosts[i].disabled) {
					continue;
				}
				hosts[i].checked = true;
			}
			break;
		case 'invert':
			for (var i = 0, till = hosts.length; i < till; i++) {
				if (hosts[i].disabled) {
					continue;
				}
				hosts[i].checked = !hosts[i].checked;
			}
			break;
		case 'reset':
			for (var i = 0, till = hosts.length; i < till; i++) {
				if (hosts[i].disabled) {
					continue;
				}
				hosts[i].checked = false;
			}
			break;
		default:
			console.error('Unexpected event target!');
			break;
		}

		return false;
	});
});
