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
				source: 'config wan'
			});
		}
		var lan = vm.lan && vm.lan.ip;
		if (lan && vm.tcpShift) {
			peersConfig[key].push({
				ip: [].concat(lan)[0],
				port: 1001,
				source: 'config lan'
			});
		}
	});

	drawPeers();
}

function drawPeers() {
	var merged = {};

	Object.keys(peersDiscovered).forEach(function (hostKey) {
		var addresses = peersDiscovered[hostKey];
		if (!merged[hostKey]) {
			merged[hostKey] = {};
		}
		addresses.forEach((address) => {
			merged[hostKey][`${address.ip}${address.port ? `:${address.port}` : ''}`] = address;
		});
	});

	Object.keys(peersConfig).forEach(function (hostKey) {
		var addresses = peersConfig[hostKey];
		if (!merged[hostKey]) {
			merged[hostKey] = {};
		}
		addresses.forEach((address) => {
			merged[hostKey][`${address.ip}${address.port ? `:${address.port}` : ''}`] = address;
		});
	});

	var hosts = [];
	var hostname = document.querySelector('.hostname').innerHTML;
	Object.keys(merged).sort().forEach(function (key) {
		hosts.push({
			key: key,
			self: key === hostname,
			addresses: Object.values(merged[key]),
		});
	});

	var hostsBlock = document.querySelector('form .hosts');
	hostsBlock.innerHTML = window.puglatizer.hosts({
		hosts: hosts
	});

	checkPeers();
}

async function requestPeers() {
	try {
		const response = await fetch('/peers');
		const data = await response.json();
		peersDiscovered = {};
		Object.keys(data).forEach((key) => {
			const item = data[key];
			peersDiscovered[key] = item.target.split(',').map((address) => {
				return {
					ip: address,
					port: item.port,
					source: 'discovery'
				};
			});
		});
		drawPeers();
	} catch (error) {
		console.error('request peers, error:', error);
	}
}

async function requestConfig() {
	try {
		const response = await fetch('/config-clean.json');
		const data = await response.json();
		const explainButton = document.querySelector('input[name="explain"]');
		explainButton.configClean = data;
	} catch (error) {
		console.error('config-clean.json request, error:', error);
	}
}

function checkPeers() {
	const formElement = document.querySelector('form');
	const hostsBlock = formElement.querySelector('.hosts');
	[].forEach.call(hostsBlock.querySelectorAll('.host .address'), async (addressElement) => {
		const host = addressElement.getAttribute('ip');
		if (!host) {
			addressElement.title = 'Loading...';
			addressElement.style.color = '#00c';
			return;
		}

		const port = addressElement.getAttribute('port');
		const input = addressElement.querySelector('input');

		if (checkRequests[addressElement.innerHTML]) {
			checkRequests[addressElement.innerHTML].abort();
		}

		const controller = new AbortController();
		checkRequests[addressElement.innerHTML] = controller;

		try {
			const response = await fetch('/check-net', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					host,
					port
				}),
				signal: controller.signal
			});

			const data = await response.json();
			if (data.type === 'opened' && !data.reason) {
				addressElement.title = 'READY';
				addressElement.style.color = '#0c0';
				addressElement.classList.add('success');
				const checked = hostsBlock.querySelector(`input[name="${input.name}"]:checked`);
				if (!checked) {
					input.checked = true;
				}
				input.disabled = false;
			} else {
				addressElement.title = data.reason;
				addressElement.style.color = '#c00';
				addressElement.classList.remove('success');
				input.checked = false;
				input.disabled = true;
			}
		} catch (error) {
			if (error.name === 'AbortError') {
				console.log(`Fetch aborted - ${host}:${port}`);
			} else {
				addressElement.title = error;
				addressElement.style.color = '#c00';
				addressElement.classList.remove('success');
				input.checked = false;
				input.disabled = true;
				console.error('request check, error:', error)
			}
		}
	});
}

document.addEventListener('DOMContentLoaded', function (event) {
	requestPeers();
	requestConfig();

	var formElement = document.querySelector('form');
	var explainButton = formElement.querySelector('input[name="explain"]');
	var configInputElement = formElement.querySelector('input[name="config"]');

	var editor = ace.edit('editor');
	editor.setTheme('ace/theme/twilight');
	editor.session.setMode('ace/mode/json');
	if (configInputElement.value) {
		editor.setValue(configInputElement.value);
	}
	editor.focus();
	var changeTimer;
	editor.on('change', function (event) {
		try {
			var data = JSON.parse(editor.getValue());
			clearTimeout(changeTimer);
			changeTimer = setTimeout(parse.bind(null, data), 1000);
		} catch (e) {
			// console.log(e);
		}
	});
	editor.session.on('changeAnnotation', function () {
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
		explainButton.disabled = !explainButton.configClean && (!!annotations.length || !editor.getValue());
		explainButton.onclick = function (e) {
			e.preventDefault();
			var div = document.createElement('div');
			div.className = 'popup';
			explainer.makeExplainer(div, config || yaumnrc.parse(explainButton.configClean));
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
