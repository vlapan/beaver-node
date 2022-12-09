import { html, render, nothing } from '/plugins/lit-html/lit-html.js';

const hostsTemplate = (hosts) => hosts.map((host) => html`
    <div class="host">
        <label>
            <input
                type="checkbox"
                name="forward"
                value="${host.key}"
                ?disabled=${host.self}
                ?checked=${host.self}
            />
            <span>${host.key}</span>
        </label>
        <ul style = "margin-top:0;list-style-type:none;padding-left:14px;">
            ${host.self ? html`
                <li>
                    <small class="address" ip="127.0.0.1">
                        <input
                            type="radio"
                            name="${host.key}"
                            disabled
                            checked
                            style="width:1em;vertical-align:middle;"
                        />
                        127.0.0.1
                    </small>&nbsp;<small style="float:right;margin-right:5px;color:grey;">local</small>
                </li>
            ` : host.addresses.map((item) => html`
                <li>
                    <small class="address" ip="${item.ip}" port="${item.port ? item.port : ''}">
                        <input
                            type="radio"
                            name="${host.key}"
                            disabled
                            checked
                            style="width:1em;vertical-align:middle;"
                            value = ${item.ip + (item.port ? ':' + item.port : '')}
                        />
                        ${item.ip + (item.port ? ':' + item.port : '')}
                    </small>
                    ${item.source ? html`
                        &nbsp;<small style="float:right;margin-right:5px;color:grey;">${item.source}</small>
                    ` : nothing}
                </li>
            `)}
        </ul>
    </div>
`);

const checkRequests = {};
let peersConfig = {};
let config;

function parse(data) {
    peersConfig = {};

    config = yaumnrc.parse(data);
    const servers = data.servers || {};

    if (data.test) {
        Object.keys(data.test).forEach(function (key) {
            servers[key] = data.test[key];
        });
    }

    Object.keys(servers).filter(function (key) {
        const item = servers[key];
        return item.router;
    }).forEach(function (key) {
        const vm = servers[key];
        if (!peersConfig[key]) {
            peersConfig[key] = [];
        }
        const wan3 = config.locations.map[vm.location].wan3;
        if (wan3 && vm.tcpShift) {
            peersConfig[key].push({
                ip: [].concat(wan3)[0],
                port: (2 + (vm.tcpShift | 0)),
                source: 'config wan',
            });
        }
        const lan = vm.lan && vm.lan.ip;
        if (lan && vm.tcpShift) {
            peersConfig[key].push({
                ip: [].concat(lan)[0],
                port: 1001,
                source: 'config lan',
            });
        }
    });

    drawPeers();

    const explainButton = document.querySelector('input[name="explain"]');
    explainButton.disabled = false;
}

function drawPeers() {
    const merged = {};

    Object.keys(peersConfig).forEach(function (hostKey) {
        const addresses = peersConfig[hostKey];
        if (!merged[hostKey]) {
            merged[hostKey] = {};
        }
        addresses.forEach((address) => {
            merged[hostKey][`${address.ip}${address.port ? `:${address.port}` : ''}`] = address;
        });
    });

    const hosts = [];
    const hostname = document.querySelector('.hostname').innerHTML;
    Object.keys(merged).sort().forEach(function (key) {
        hosts.push({
            key: key,
            self: key === hostname,
            addresses: Object.values(merged[key]),
        });
    });

    const hostsBlock = document.querySelector('form .hosts');
    render(hostsTemplate(hosts), hostsBlock);

    checkPeers();
}

async function requestConfig() {
    try {
        const response = await fetch('/config-clean.json');
        const data = await response.json();
        const explainButton = document.querySelector('input[name="explain"]');
        explainButton.configClean = data;
        explainButton.disabled = !explainButton.configClean;
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

        const requestKey = `${host}${port ? `:${port}` : ''}`;
        if (checkRequests[requestKey]) {
            checkRequests[requestKey].abort();
        }

        const controller = new AbortController();
        checkRequests[requestKey] = controller;

        try {
            const response = await fetch('/check-net', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    host,
                    port,
                }),
                signal: controller.signal,
            });

            const data = await response.json();
            if (data.type === 'opened' && !data.reason) {
                addressElement.title = `READY - ${JSON.stringify(data.status, null, 4)}`;
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
                console.error('request check, error:', error);
            }
            addressElement.title = error;
            addressElement.style.color = '#c00';
            addressElement.classList.remove('success');
            input.checked = false;
            input.disabled = true;
        }
    });
}

document.addEventListener('DOMContentLoaded', function (event) {
    requestConfig();

    const formElement = document.querySelector('form');
    const configInputElement = formElement.querySelector('input[name="config"]');

    const explainButton = formElement.querySelector('input[name="explain"]');
    explainButton.onclick = function (e) {
        e.preventDefault();
        if (document.getElementById('explainPopup')) {
            return false;
        }
        const div = document.createElement('div');
        div.id = 'explainPopup';
        div.className = 'popup';
        explainer.makeExplainer(div, config || yaumnrc.parse(explainButton.configClean));
        div.children[0].style.backgroundColor = '#fff';
        document.body.appendChild(div);
        return false;
    };

    const editor = ace.edit('editor');
    editor.setTheme('ace/theme/twilight');
    editor.session.setMode('ace/mode/json');
    if (configInputElement.value) {
        editor.setValue(configInputElement.value);
    }
    editor.focus();
    let changeTimer;
    editor.on('change', function (event) {
        try {
            const data = JSON.parse(editor.getValue());
            clearTimeout(changeTimer);
            changeTimer = setTimeout(parse.bind(null, data), 1000);
        } catch (e) {
            // console.log(e);
        }
    });
    editor.session.on('changeAnnotation', function () {
        const annotations = editor.session.getAnnotations();
        const errorsBlock = formElement.querySelector('.errors');
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
        const submitButton = formElement.querySelector('input[name="submit"]');
        if (!submitButton) {
            return;
        }
        submitButton.disabled = !!annotations.length || !editor.getValue();
        explainButton.disabled = !explainButton.configClean && (!!annotations.length || !editor.getValue());
    });

    formElement.addEventListener('submit', function (event) {
        configInputElement.value = editor.getValue();
        const submitButton = formElement.querySelector('input[name="submit"]');
        if (!submitButton) {
            return;
        }
        submitButton.disabled = true;
    });

    const recheckButton = formElement.querySelector('.btn-recheck');
    recheckButton.addEventListener('click', function (event) {
        event.preventDefault();
        drawPeers();
        return false;
    });

    const buttonsBlock = formElement.querySelector('.buttons');
    buttonsBlock.addEventListener('click', function (event) {
        event.preventDefault();

        if (event.target.tagName !== 'BUTTON') {
            return;
        }

        const hosts = formElement.querySelectorAll('.host input[name="forward"]');
        switch (event.target.className) {
            case 'all':
                for (let i = 0, till = hosts.length; i < till; i++) {
                    if (hosts[i].disabled) {
                        continue;
                    }
                    hosts[i].checked = true;
                }
                break;
            case 'invert':
                for (let i = 0, till = hosts.length; i < till; i++) {
                    if (hosts[i].disabled) {
                        continue;
                    }
                    hosts[i].checked = !hosts[i].checked;
                }
                break;
            case 'reset':
                for (let i = 0, till = hosts.length; i < till; i++) {
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
