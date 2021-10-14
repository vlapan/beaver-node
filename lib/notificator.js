const fs = require('fs');
const os = require('os');
const debug = require('debug')('beaver:notificator:slack');

const { IncomingWebhook } = require('@slack/webhook');

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
            // TODO: use loop and filter by type
            const { slack } = config.notify || {};
            if (typeof slack === 'object' && slack.type === 'slack' && typeof slack.hook === 'string') {
                const message = `${argv.hostname}: ${msg}`;
                debug(message);
                if (!argv.disableNotify && ~slack.hook.indexOf('https://hooks.slack.com/')) {
                    const webhook = new IncomingWebhook(slack.hook);
                    await webhook.send({
                        text: message,
                        blocks: [{
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `${message}`,
                            },
                        }],
                    });
                }
                if (!argv.disableNotify && ~slack.hook.indexOf('https://slack.com/api/chat.postMessage')) {
                    const webhook = new IncomingWebhook(slack.hook);
                    await webhook.send({
                        text: message,
                        blocks: [{
                            type: 'section',
                            token : `${slack.auth}`,
                            text: {
                                type: 'mrkdwn',
                                text: `${message}`,
                            },
                        }],
                    });
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
