function pathJoin(path) {
    const result = [];
    for (const item of path) {
        if (item[0] === '[' || item[item.length - 1] === ']') {
            result.push(item);
        } else if (item.match(/^[a-zA-Z][a-zA-Z0-9_]+$/)) {
            result.push(`.${item}`);
        } else {
            result.push(`[${item}]`);
        }
    }
    return result.join('').replace(/^\./gm, '');
}

function diff(a, b) {
    const m = (op, x) => {
        const spl = x.split(':');
        const pathString = spl.shift().trim();
        const valueString = spl.join(':');
        return {
            op,
            pathString,
            path: pathString.split(/\.(?![^[]*\])/),
            value: typeof valueString === 'string' ? valueString.trim() : valueString,
        };
    };
    return a.filter(x => !b.includes(x)).map(m.bind(null, '-')).concat(b.filter(x => !a.includes(x)).map(m.bind(null, '+'))).sort((x, y) => {
        if (x.pathString === y.pathString) {
            return x.op === '+' ? 1 : -1;
        }
        if (x.pathString > y.pathString) {
            return 1;
        }
        return -1;
    });
}

function joiner(o, path = []) {
    let r = [];
    for (const [key, v] of Object.entries(o)) {
        const p = Array.isArray(o) ? [...path, '[]'] : [...path, key];
        const pj = pathJoin(p);
        if (typeof v !== 'object') {
            r.push(`${pj}: ${v}`);
            // const i = r.indexOf(pj);
            // if (~i) {
            //     delete r[i];
            // }
        } else {
            // r.push(`${pj}`);
            r = [...r, ...joiner(v, p)];
        }
    }
    return r;
}

function drawTreeLevel(o, level = 0, path = [], result = [], spaces = 2) {
    for (const [key, value] of Object.entries(o)) {
        let fp = [...path];
        if (Array.isArray(value)) {
            const fpp = fp.join('.');
            if (fpp) {
                result.push(`${' '.repeat(spaces * level)}${level === 0 ? '' : '.'}${fpp}`);
            }
            for (const x of value) {
                result.push(`${' '.repeat(spaces * ((fpp ? 1 : 0) + level - 1))}${x.op} ${key}${x.value ? `: ${x.value}` : ''}`);
            }
        } else if (typeof value === 'object') {
            if (Object.keys(value).length > 1) {
                result.push(`${' '.repeat(spaces * level)}${level === 0 ? '' : '.'}${fp.length ? `${fp.join('.')}.` : ''}${key}`);
                fp = [];
            } else {
                fp.push(key);
            }
            for (const item of drawTreeLevel(value, Object.keys(value).length > 1 ? level + 1 : level, fp)) {
                result.push(item);
            }
        }
    }
    return result;
}

function drawTree(result) {
    const o = {};
    for (const item of result) {
        if (!o[item.path[0]]) {
            o[item.path[0]] = {};
        }
        let oi = o[item.path[0]];
        for (let i = 1, till = item.path.length; i < till; i++) {
            const path = item.path[i];
            if (i === item.path.length - 1) {
                if (oi[path]) {
                    if (Array.isArray(oi[path])) {
                        oi[path].push(item);
                    } else {
                        oi[path] = [oi[path], item];
                    }
                } else {
                    oi[path] = [item];
                }
            } else if (!oi[path]) {
                oi[path] = {};
            }
            oi = oi[path];
        }
    }
    // console.log(JSON.stringify(o, null, 4));
    // console.log('-'.repeat(80));
    return drawTreeLevel(o);
}

function drawFlatTreeLevel(o, result = []) {
    for (const [gpath, item] of Object.entries(o)) {
        let first = true;
        for (const [ipath, value] of Object.entries(item).sort((a, b) => {
            if (a[0].slice(-2, a[0].length) === '[]' && b[0].slice(-2, b[0].length) !== '[]') {
                return 1;
            }
            if (a[0].slice(-2, a[0].length) !== '[]' && b[0].slice(-2, b[0].length) === '[]') {
                return -1;
            }
            if (Array.isArray(a[1]) && !Array.isArray(b[1])) {
                return 1;
            }
            if (!Array.isArray(a[1]) && Array.isArray(b[1])) {
                return -1;
            }
            return a[0] > b[0] ? 1 : -1;
        })) {
            if (ipath.slice(-2, ipath.length) === '[]') {
                result.push(`${gpath}.${ipath}`);
                for (const v of value) {
                    result.push(` ${v.op} ${v.value}`);
                }
                first = true;
            } else {
                if (first) {
                    result.push(`${gpath || '.'}`);
                    first = false;
                }
                for (const v of value) {
                    result.push(` ${v.op} ${ipath}: ${v.value}`);
                }
            }
        }
    }
    return result;
}


function drawFlatTree(result) {
    const o2 = {};
    for (const item of result) {
        const p = [];
        for (let i = 0, till = item.path.length; i < till; i++) {
            const path = item.path[i];
            if (i === item.path.length - 1) {
                const pk = p.join('.');
                if (typeof o2[pk] !== 'object') {
                    o2[pk] = {};
                }
                if (Array.isArray(o2[pk][path])) {
                    o2[pk][path].push(item);
                } else {
                    const ot = o2[pk];
                    ot[path] = [item];
                    o2[pk] = ot;
                }
            } else {
                p.push(path);
            }
        }
    }
    // console.log('o2', JSON.stringify(o2, null, 4));
    // console.log('-'.repeat(80));
    return drawFlatTreeLevel(o2);
}

module.exports = function (a, b) {
    // console.log('='.repeat(80));
    // console.log('A: ', JSON.stringify(a, null, 4));
    // console.log('-'.repeat(80));
    // console.log('B: ', JSON.stringify(b, null, 4));
    // console.log('-'.repeat(80));
    // console.log(joiner(a).sort().join('\n'));
    // console.log('-'.repeat(80));
    // console.log(joiner(b).sort().join('\n'));
    // console.log('-'.repeat(80));
    const result = diff(joiner(a), joiner(b));
    // console.log(result.map((x) => `${x.op} ${x.value}`));

    // const res1 = drawTree(result);
    // console.log(res1.join('\n'));

    const res2 = drawFlatTree(result);
    // console.log(res2.join('\n'));
    return res2;
};