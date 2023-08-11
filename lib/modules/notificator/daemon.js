const fs = require('node:fs');
const path = require('node:path');

const AbstractDaemon = require('../AbstractDaemon');
const notificator = require('../../notificator');

const { pathAsJSON, sleep } = require('../../utils');
const { checkFileExists } = require('../../utils/fs');

class NotificatorDaemon extends AbstractDaemon {
    constructor(o) {
        super(o);
        this.fileName = 'notificator.json';
        this.file = path.join(this.o.argv.home, this.fileName);
        this.o.ac.signal.addEventListener('abort', () => {
            this.stop();
        }, {
            once: true,
        });
    }

    async start() {
        const configExists = await checkFileExists(this.file);
        if (configExists) {
            this.readConfig();
        } else {
            this.debug('no config found');
        }
        this.changeListener = (curr, prev) => {
            if (curr.mtime > prev.mtime) {
                this.readConfig();
            }
        };
        fs.watchFile(this.file, this.changeListener);
    }

    stop() {
        this.resetTimers();
        fs.unwatchFile(this.file, this.changeListener);
    }

    resetTimers() {
        for (const timer of Object.values(this.timers || {})) {
            if (typeof timer === 'object' && typeof timer.abort === 'function') {
                timer.abort();
            }
        }
        this.timers = {};
    }

    async readConfig() {
        this.resetTimers();
        const notifications = await pathAsJSON(this.file, false);
        if (!Array.isArray(notifications)) {
            return;
        }
        notifications.forEach(async (notification) => {
            const timer = sleep(notification.date);
            if (timer === false) {
                this.debug(`skipped: ${JSON.stringify(notification, null, 0)}`);
                return;
            }
            this.timers[notification.date] = timer;
            this.debug(`loaded: ${JSON.stringify(notification, null, 0)}`);
            try {
                await timer;
                this.debug(`ready: ${JSON.stringify(notification, null, 0)}`);
                notificator.notify(notification.message);
            } catch (e) {
                this.debug(`aborted: ${JSON.stringify(notification, null, 0)}`);
            }
        });
    }
}

module.exports = NotificatorDaemon;