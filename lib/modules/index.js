import notificatorTransformer from './notificator/transformer.js';
import cleanConfigTransformer from './cleanConfig/transformer.js';
import hostsTransformer from './hosts/transformer.js';
import sshConfigTransformer from './sshConfig/transformer.js';
import importantMessagesTransformer from './importantMessages/transformer.js';
import passwdTransformer from './passwd/transformer.js';
import notificatorDaemon from './notificator/daemon.js';
import { toKebabCase } from '../utils/index.js';

const M = {
    transformers: [
        notificatorTransformer,
        cleanConfigTransformer,
        hostsTransformer,
        sshConfigTransformer,
        importantMessagesTransformer,
        passwdTransformer,
    ],
    daemons: [
        notificatorDaemon,
    ],
    f: (k) => (v) => (typeof v[k] === 'function' ? v[k]() : Promise.resolve()),
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
export const transformers = M.transformers;
export const daemons = M.daemons;
export const f = M.f;
export const toKey = M.toKey;
export const init = M.init;

export default M;
