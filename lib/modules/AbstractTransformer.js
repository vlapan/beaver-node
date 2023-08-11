const AbstractBase = require('./AbstractBase.js');

class AbstractTransformer extends AbstractBase {
    static #key = 'Transformer';

    constructor(o) {
        o.key = AbstractTransformer.#key;
        o.debug = o.debug.extend('extentions');
        super(o);
    }

    transform() {
        return Promise.resolve(true);
    }

    postTransform() {
        return Promise.resolve(true);
    }

    preHook() {
        return Promise.resolve(true);
    }

    postHook() {
        return Promise.resolve(true);
    }
}

module.exports = AbstractTransformer;