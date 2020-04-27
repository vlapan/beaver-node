const crypto = require('crypto');

module.exports = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj), 'utf8').digest('hex').slice(0, 8);
