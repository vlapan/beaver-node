module.exports = {
    file(strings, ...keys) {
        const result = [];
        let symbol = '';
        let count = 0;
        for (let i = 0, till = strings.length; i < till; i++) {
            const string = strings[i];
            const value = keys[i];
            if (i === 0) {
                const [, flsp] = string.match(/^\n(\s+)/);
                [symbol] = flsp;
                count = flsp.length;
            }
            result.push(string);
            result.push(value);
        }
        return result.join('').replace(/^\n/, '').replace(/^\s+$/, '').replace(new RegExp(`^${symbol}{0,${count}}`, 'gm'), '');
    },
    columnize(t) {
        const rmax = [];
        for (const l of t) {
            for (const [i, v] of Object.entries(l)) {
                if (rmax[i] === undefined || rmax[i] < v.length) {
                    rmax[i] = v.length;
                }
            }
        }
        const r = [];
        for (const l of t) {
            r.push(l.map((x, i) => {
                if (l.length === i + 1) {
                    return x;
                }
                return `${x}${' '.repeat(rmax[i] - x.length)}`;
            }).join(' '));
        }
        return r;
    },
};
