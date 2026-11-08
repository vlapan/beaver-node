import crypto from 'node:crypto';

const moduleExports = (obj, length = 8) => crypto.createHash('sha256').update(JSON.stringify(obj), 'utf8').digest('hex').slice(0, length);

export default moduleExports;
