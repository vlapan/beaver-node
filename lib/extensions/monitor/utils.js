const { compareHost } = require('../../utils/index');

const protocolToLevel6 = {
    http: 'plain',
    https: 'secure',
};

function getIPForSort(ip) {
    return ip.split('.').map((num) => num.padStart(3, '0')).join('');
}

function sortFunc(a, b) {
    return a.name.localeCompare(b.name) || compareHost(a.host, b.host) || getIPForSort(a.ip).localeCompare(getIPForSort(b.ip)) || Number.parseInt(a.port, 10) - Number.parseInt(b.port, 10);
}

function filterBySubject(arr) {
    const filter = {};
    const result = [];
    for (const item of arr) {
        if (filter[item.subject]) {
            continue;
        }
        filter[item.subject] = 1;
        item.name = undefined;
        item.host = undefined;
        item.type = undefined;
        result.push(item);
    }
    return result;
}

module.exports = {
    protocolToLevel6,
    sortFunc,
    filterBySubject,
};
