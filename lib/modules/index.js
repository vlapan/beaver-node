const { toKebabCase } = require('../utils/index.js');

const M = {
    transformers: [
        require('./notificator/transformer'),
        require('./cleanConfig/transformer'),
    ],
    daemons: [
        require('./notificator/daemon'),
    ],
    f: (k) => (v) => typeof v[k] === 'function' ? v[k]() : Promise.resolve(),
    toKey: (v) => v.charAt(0).toLowerCase() + v.slice(1),
    init: (o, enabled) => {
        const obj = Object.fromEntries(M.transformers
            .filter((v) => v.systemic === true || ~enabled.indexOf(toKebabCase(v.name)))
            .map((v) => new v({ ...o }))
            .reduce((a, b) => a.set(M.toKey(b.constructor.name), b), new Map()));
        return {
            ...obj,
            transform: () => Promise.all(Object.values(obj).map(M.f('transform'))),
            postTransform: () => Promise.all(Object.values(obj).map(M.f('postTransform'))),
            postHook: () => Promise.all(Object.values(obj).map(M.f('postHook'))),
        };
    },
};

module.exports = M;