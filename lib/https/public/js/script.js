var checkRequests = {};

function parse(data) {
	var hostname = document.querySelector('.hostname').innerHTML;
	var formElement = document.querySelector('form');
	var hostsBlock = formElement.querySelector('.hosts');

	var hosts = data.vms || {};
	if (data.test) {
		Object.keys(data.test).forEach(function (key) {
			hosts[key] = data.test[key];
		});
	}
	hosts = Object.keys(hosts).filter(function (key) {
		var item = hosts[key];
		return item.router;
	}).map(function (key) {
		var item = hosts[key];
		item.key = key;
		if (key === hostname) {
			item.self = true;
		}
		return item;
	});
	hostsBlock.innerHTML = window.templatizer.hosts({
		hosts: hosts
	});
	[].forEach.call(hostsBlock.querySelectorAll('.host span'), function (host) {
		var ip = host.getAttribute('ip');
		if (!ip) {
			host.style.color = '#00c';
			return;
		}
		if (checkRequests[host.innerHTML]) {
			checkRequests[host.innerHTML].abort();
		}
		checkRequests[host.innerHTML] = $.post('/check-net', {
			host: ip
		}, function (data) {
			if (data.reason) {
				host.title = data.reason;
				host.style.color = '#c00';
			} else {
				host.title = '';
				host.style.color = '#0c0';
			}
		}, 'json');
	});
}

document.addEventListener("DOMContentLoaded", function (event) {
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
	});

	formElement.addEventListener('submit', function (event) {
		configInputElement.value = editor.getValue();
	});

	var buttonsBlock = formElement.querySelector('.buttons');
	buttonsBlock.addEventListener('click', function (event) {
		event.preventDefault();

		if (event.target.tagName !== 'BUTTON') {
			return;
		}

		var hosts = formElement.querySelectorAll('.host input');
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
