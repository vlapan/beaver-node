const rdiff = require('recursive-diff');
const debug = require('debug')('odiff');

const opToSymbol = {
    add: {
        text: '+',
        emoji: '➕',
    },
    delete: {
        text: '-',
        emoji: '➖',
    },
    update: {
        text: '*',
        emoji: '➗',
    },
};

function pathJoin(path) {
    const result = [];
    for (const item of path) {
        if (typeof item === 'string' && item.includes('.')) {
            result.push(`[${item}]`);
        } else {
            result.push(`.${item}`);
        }
    }
    return result.join('').replace(/^\./gm, '');
}

function flatObject(object, path = []) {
    const result = [];
    for (const [key, value] of Object.entries(object)) {
        if (typeof value === 'object') {
            for (const item of flatObject(value, [...path, key])) {
                result.push(item);
            }
        } else {
            result.push(`${[...path, key].map((x) => x.includes('.') ? `[${x}]` : `.${x}`).join('')}: ${value}`);
        }
    }
    return result;
}

function draw(change, value) {
    if (change.op === 'update') {
        return `${typeof change.oldVal !== 'object' ? `'${change.oldVal}'` : JSON.stringify(change.oldVal)} => '${value}'`;
    }
    if (change.op === 'delete') {
        const result = change.oldVal;
        if (typeof result === 'object') {
            return flatObject(result);
        }
        return result;
    }
    return value;
}

module.exports = function (a, b) {
    const diff = rdiff.getDiff(a, b, true);
    const changes = [];

    for (const change of diff) {
        const opSymbol = opToSymbol[change.op].text;
        if (change.op === 'delete') {
            change.val = change.oldVal;
        }
        if (typeof change.val === 'object') {
            for (const item of flatObject(change.val)) {
                debug(1, change.path, item);
                changes.push(`${opSymbol} ${pathJoin(change.path)}${item}`);
            }
        } else {
            const value = change.val || '';
            const x = draw(change, value);
            if (Array.isArray(x)) {
                for (const item of x) {
                    debug(2, change.path, item);
                    changes.push(`${opSymbol} ${pathJoin(change.path)}${item}`);
                }
            } else {
                debug(3, change.path, x ? `: ${x}` : '');
                changes.push(`${opSymbol} ${pathJoin(change.path)}${x ? `: ${x}` : ''}`);
            }
        }
    }

    return changes;
};