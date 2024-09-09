const crypto = require('node:crypto');

module.exports = (obj, length = 8) => crypto.createHash('sha256').update(JSON.stringify(obj), 'utf8').digest('hex').slice(0, length);
