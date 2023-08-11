const AbstractBase = require('./AbstractBase.js');

class AbstractDaemon extends AbstractBase {
    static #key = 'Daemon';

    constructor(o) {
        o.key = AbstractDaemon.#key;
        o.debug = o.debug.extend(`${o.key.toLowerCase()}s`);
        super(o);
    }

    start() {
        return Promise.resolve();
    }

    stop() {
        return Promise.resolve();
    }
}

module.exports = AbstractDaemon;