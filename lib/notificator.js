const fs = require('fs');
const debug = require('debug')('beaver:notificator:slack');

const { IncomingWebhook } = require('@slack/webhook');

const argv = require('./argv');

const M = {
    async notify(msg) {
        try {
            const json = await fs.promises.readFile(`${argv.home}/monitor.json`);
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
                    });
                }
            }
        } catch(e) {
            console.error(e);
        }
    },
    async daemonStarted() {
        const path = `${__dirname}/../package.json`;
        const json = await fs.promises.readFile(path);
        const data = JSON.parse(json);
        M.notify(`Daemon started: ${data.version}`);
    }
};

module.exports = M;