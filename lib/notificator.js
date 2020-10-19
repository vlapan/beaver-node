const fs = require('fs');
const os = require('os');
const debug = require('debug')('beaver:notificator:slack');

const { IncomingWebhook } = require('@slack/webhook');

const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');

dayjs.extend(relativeTime);

const argv = require('./argv');
const { checkFileExists } = require('./utils/fs');

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
    async getVersion() {
        const path = `${__dirname}/../package.json`;
        const json = await fs.promises.readFile(path);
        const data = JSON.parse(json);
        return data.version;
    },
    async daemonStarted() {
        const lastPath = `${argv.home}/last.json`;
        let message = 'beaver:daemon:start:report';
        message += `\n    beaver: ${await M.getVersion()}`;
        const bootDate = new Date(new Date() - os.uptime() * 1000);
        const uptime = dayjs(bootDate).fromNow();
        message += `\n    os: ${os.type()} ${os.release()} (${bootDate.toISOString()}, ${uptime})`;
        if (await checkFileExists(lastPath)) {
            const lastJson = await fs.promises.readFile(lastPath);
            const last = JSON.parse(lastJson);
            message += `\n    last generation: ${last.version} (${last.date}, ${dayjs(new Date(last.date)).fromNow()})`;
        }
        await M.notify(message);
    }
};

module.exports = M;