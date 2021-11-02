const fs = require('fs');
const os = require('os');
const url = require('url');

const axios = require('axios').default;
const debug = require('debug')('beaver:notificator:slack');

const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');

dayjs.extend(relativeTime);

const argv = require('./argv');
const versions = require('../versions');
const { checkFileExists } = require('./utils/fs');

const M = {
    async notify(msg) {
        const monitorPath = `${argv.home}/monitor.json`;
        if (!await checkFileExists(monitorPath)) {
            return;
        }
        try {
            const json = await fs.promises.readFile(monitorPath);
            const config = JSON.parse(json);
            const recipients = Object.values(config.notify).filter((x) => x.type === 'slack' && typeof x.hook === 'string');
            for (const recipient of recipients) {
                const message = `${argv.hostname}: ${msg}`;
                debug(message);
                if (argv.disableNotify) {
                    continue;
                }
                const data = {
                    text: message,
                    blocks: [{
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `${message}`,
                        },
                    }],
                };
                if (~recipient.hook.indexOf('https://hooks.slack.com/')) {
                    const response = await axios.post(recipient.hook, data, {
                        headers: {
                            'Content-Type': 'application/json;charset=utf-8',
                        },
                    });
                    if (response.data.ok === false) {
                        throw new Error(response.data.error);
                    }
                } else if (~recipient.hook.indexOf('https://slack.com/api/chat.postMessage')) {
                    const urlParsed = new url.URL(recipient.hook);
                    const channel = urlParsed.searchParams.get('channel') || recipient.channel;
                    const response = await axios.post(`${urlParsed.origin}${urlParsed.pathname}`, {
                        ...data,
                        channel: channel,
                    }, {
                        headers: {
                            Authorization: `Bearer ${recipient.auth}`,
                            'Content-Type': 'application/json;charset=utf-8',
                        },
                    });
                    if (response.data.ok === false) {
                        throw new Error(response.data.error);
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }
    },
    async daemonStarted() {
        const lastPath = `${argv.home}/last.json`;
        const bootDate = new Date(new Date() - os.uptime() * 1000);
        const uptime = dayjs(bootDate).fromNow(true);
        const messageParts = [`Daemon started, v${await versions.get('beaver')}`];
        if (await checkFileExists(lastPath)) {
            const lastJson = await fs.promises.readFile(lastPath);
            const last = JSON.parse(lastJson);
            messageParts.push(`config ${dayjs(new Date(last.date)).fromNow()} @v${last.version}`);
        }
        messageParts.push(`yaumrc v${await versions.get('yaumrc')}`);
        messageParts.push(`os ${os.type()} ${os.release()}`);
        messageParts.push(`uptime ${uptime}`);
        await M.notify(messageParts.join(', '));
    },
};

module.exports = M;
