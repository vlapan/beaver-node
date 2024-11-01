const crypto = require('node:crypto');

function checkSecretBody(secret, body) {
    try {
        const data = typeof body === 'string' ? JSON.parse(body) : body;
        return data.secret === secret;
    } catch {
        return false;
    }
}

function checkSecretGitlab(secret, headers) {
    return headers['X-Gitlab-Token'] === secret;
}

const algMap = {
    sha1: 'sha1',
    sha256: 'sha256',
};

function getSig(data) {
    const spt = data.split('=');
    if (spt.length === 1) {
        return {
            alg: 'sha256',
            sig: spt.shift(),
        };
    }
    const alg = algMap[spt.shift()];
    if (!alg) {
        throw new Error('bad alg');
    }
    return {
        alg,
        sig: spt.shift(),
    }
}

function checkSecretHub(secret, headers, body) {
    const encoder = new TextEncoder();
    const data = headers['X-Hub-Signature-256'] ?? headers['X-Hub-Signature'];
    try {
        const { alg, sig } = getSig(data);
        const hmac = crypto.createHmac(alg, secret);
        hmac.update(body, 'utf8');
        return crypto.timingSafeEqual(encoder.encode(sig), encoder.encode(hmac.digest('hex')));
    } catch {
        return false;
    }
}

function checkSecret(secret, headers, body) {
    if (checkSecretGitlab(secret, headers)) {
        return true;
    } else if (checkSecretHub(secret, headers, body)) {
        return true;
    } else if (checkSecretBody(secret, body)) {
        return true;
    }
    return false;
}

module.exports = {
    checkSecret,
};
