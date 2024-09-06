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

async function getMonitoringResults() {
    const response = await fetch('/monitor-result.txt');
    if (response.ok) {
        return response.text();
    }
    throw new Error(`${response.statusText} on request for "${response.url}"`);
}

function closeOtherPopups() {
    for (const item of document.querySelectorAll('.popup')) {
        item.remove();
    }
}

document.addEventListener('DOMContentLoaded', function (event) {
    requestConfig();

    const formElement = document.querySelector('form');
    const configInputElement = formElement.querySelector('input[name="config"]');

    const monitoringButton = formElement.querySelector('input[name="monitoring"]');
    monitoringButton.onclick = function (e) {
        e.preventDefault();
        if (document.getElementById('monitoringPopup')) {
            document.getElementById('monitoringPopup').remove();
            return false;
        }
        closeOtherPopups();
        const outterDiv = document.createElement('div');
        outterDiv.id = 'monitoringPopup';
        outterDiv.className = 'popup';
        outterDiv.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;text-align:center;height:100%;font-size:3vw;">Loading...</div>';
        document.body.append(outterDiv);
        getMonitoringResults().then((x) => {
            const result = [];
            for (const line of x.trim().split('\n')) {
                result.push(`<span style="color:#${line.includes('FAIL') ? '700' : '070'}">${line}</span>`);
            }
            const container = document.createElement('div');
            container.className = 'popup-inner';
            container.innerHTML = `<h1 style="margin:0 0 5px 0;">Monitoring result</h1>${result.join('<br>')}<br><br>`;

            const monitorFileLink = document.createElement('a');
            monitorFileLink.href = '/monitor-result.txt';
            monitorFileLink.target = '_blank';
            monitorFileLink.innerHTML = 'Link to the file with last monitoring result';
            container.append(monitorFileLink);

            outterDiv.innerHTML = '';
            outterDiv.append(container);
            return x;
        }).catch((e) => {
            console.error(e);
            outterDiv.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;text-align:center;height:100%;font-size:3vw;color:red;">${e}</div>`;
        });
        return false;
    }

    const explainButton = formElement.querySelector('input[name="explain"]');
    explainButton.onclick = function (e) {
        e.preventDefault();
        if (document.getElementById('explainPopup')) {
            document.getElementById('explainPopup').remove();
            return false;
        }
        closeOtherPopups();
        const outterDiv = document.createElement('div');
        outterDiv.id = 'explainPopup';
        outterDiv.className = 'popup';
        const container = document.createElement('div');
        container.className = 'popup-inner';
        explainer.makeExplainer(container, config || yaumnrc.parse(explainButton.configClean), () => {
            outterDiv.remove();
        });
        container.children[0].style.backgroundColor = '#fff';
        outterDiv.append(container);
        document.body.append(outterDiv);
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
        } catch {}
    });
    editor.session.on('changeAnnotation', function () {
        const annotations = editor.session.getAnnotations();
        const errorsBlock = formElement.querySelector('.errors');
        if (!editor.getValue()) {
            errorsBlock.innerHTML = 'Empty';
        } else {
            if (annotations.length > 0) {
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
        submitButton.disabled = annotations.length > 0 || !editor.getValue();
        explainButton.disabled = !explainButton.configClean && (annotations.length > 0 || !editor.getValue());
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

window.logout = (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.location.href = '/logout';
    return false;
};
