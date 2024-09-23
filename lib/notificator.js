const fs = require('node:fs');
const os = require('node:os');
const url = require('node:url');

const axios = require('axios').default;
const debug = require('debug')('beaver:notificator');

const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');

dayjs.extend(relativeTime);

const argv = require('./argv');
const versions = require('../versions');
const { checkFileExists } = require('./utils/fs');
const { isPlainObject, pathAsJSON } = require('./utils');

const M = {
    getData(messageRaw, from, emoji = ':meow_fire:') {
        const messages = [];
        let messagesTmp = [];
        let messagesTmpSize = 0;
        const messagesTmpSizeLimit = 3000;
        let isQuoteOpen = false;
        messageRaw.split('\n').forEach(function (line, index) {
            const quotes = line.match(/```/g);
            if (quotes) {
                isQuoteOpen = isQuoteOpen ? quotes.length % 2 === 0 : quotes.length % 2 === 1;
            }
            const lineLimited = line.slice(0, messagesTmpSizeLimit);
            const size = lineLimited.length + (index > 0 ? 1 : 0) + (isQuoteOpen ? 3 : 0);
            if ((messagesTmpSize + size) > messagesTmpSizeLimit) {
                if (isQuoteOpen) {
                    messagesTmp.push('```');
                }
                messages.push(messagesTmp);
                messagesTmp = [];
                messagesTmpSize = 0;
                if (isQuoteOpen) {
                    messagesTmp.push('```');
                    messagesTmpSize = 3;
                }
            }
            messagesTmpSize += size;
            messagesTmp.push(lineLimited);
        });
        if (messagesTmp.length > 0) {
            messages.push(messagesTmp);
        }
        return {
            icon_emoji: emoji,
            username: from,
            text: messageRaw,
            blocks: messages.map((a) => {
                return {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: a.join('\n'),
                    },
                };
            }),
        };
    },
    async notify(msg, from) {
        const monitorPath = `${argv.home}/monitor.json`;
        if (!await checkFileExists(monitorPath)) {
            return;
        }
        try {
            const config = await pathAsJSON(monitorPath);
            if (!isPlainObject(config) || !isPlainObject(config.notify)) {
                return;
            }
            const recipients = Object.values(config.notify).filter((x) => isPlainObject(x) && x.type === 'slack' && typeof x.hook === 'string');
            from = `${argv.hostname}:beaver${from ? `:${from}` : ''}`;
            debug(`${from}\n${msg}`);
            if (argv.disableNotify) {
                debug('notifications are globally disabled');
                return;
            }
            for (const recipient of recipients) {
                if (recipient.disabled) {
                    continue;
                }
                await M.post(recipient, msg, from, recipient.emoji);
            }
        } catch (e) {
            console.error(e);
        }
    },
    async post(recipient, message, from, emoji) {
        const data = M.getData(message, from, emoji);
        if (~recipient.hook.indexOf('https://hooks.slack.com/')) {
            const response = await axios.post(recipient.hook, data, {
                headers: {
                    'Content-Type': 'application/json;charset=utf-8',
                },
            });
            if (response.data.ok === false) {
                throw new Error(response.data.error);
            }
        } else if (~recipient.hook.indexOf('https://slack.com/api/chat.postMessage') && typeof recipient.auth === 'string') {
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
    },
    async daemonStarted() {
        const lastPath = `${argv.home}/last.json`;
        const bootDate = new Date(Date.now() - os.uptime() * 1000);
        const uptime = dayjs(bootDate).fromNow(true);
        const messageParts = [`Daemon started (${os.userInfo().username}), v${await versions.get('beaver')}`];
        if (await checkFileExists(lastPath)) {
            const lastJson = await fs.promises.readFile(lastPath, 'utf8');
            if (typeof lastJson === 'string' && lastJson.trim()) {
                const last = JSON.parse(lastJson);
                messageParts.push(`config ${dayjs(new Date(last.date)).fromNow()} @v${last.version}`);
            }
        }
        messageParts.push(
            `yaumnrc v${await versions.get('yaumnrc')}`,
            `os ${os.type()} ${os.release()}`,
            `uptime ${uptime}`,
        );
        await M.notify(messageParts.join(', '), 'daemon');
    },
};

module.exports = M;
