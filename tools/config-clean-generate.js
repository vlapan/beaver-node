const fs = require('node:fs');
const crypto = require('node:crypto');

const x509 = require('@peculiar/x509');

const { mkdirSafe, checkFileExists } = require('../lib/utils/fs');
const { createSubject } = require('../lib/utils');

const type = process.argv.pop();

function keyToPem(key) {
    return crypto.KeyObject.from(key).export({
        type: 'pkcs8',
        format: 'pem',
    })
}

async function generateRoot(alg) {
    const keys = await crypto.subtle.generateKey(alg, true, ['sign', 'verify']);
    const crt = await x509.X509CertificateGenerator.create({
        subject: createSubject('C=RU, ST=RU, OU=example.org, CN=RootTest'),
        issuer: createSubject('C=RU, ST=RU, OU=example.org, CN=RootTest'),
        notBefore: new Date(),
        notAfter: new Date().setFullYear(new Date().getFullYear() + 1),
        keys,
        signingAlgorithm: alg,
        signingKey: keys.privateKey,
        publicKey: keys.publicKey,
        extensions: [
            new x509.BasicConstraintsExtension(true, 2, true),
            new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
            await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
        ],
    });

    return {
        keys,
        crt: crt.toString('pem'),
    };
}

async function generateIntermediate(alg, rootKeys, name = 'IntermediateTest') {
    const keys = await crypto.subtle.generateKey(alg, true, ['sign', 'verify']);
    const crt = await x509.X509CertificateGenerator.create({
        subject: createSubject(`C=RU, ST=RU, L=Moscow, OU=example.org, CN=${name}`),
        issuer: createSubject('C=RU, ST=RU, OU=example.org, CN=RootTest'),
        notBefore: new Date(),
        notAfter: new Date().setFullYear(new Date().getFullYear() + 1),
        keys,
        signingAlgorithm: alg,
        signingKey: rootKeys.privateKey,
        publicKey: keys.publicKey,
        extensions: [
            new x509.BasicConstraintsExtension(true, 0, true),
            new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
            new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth, x509.ExtendedKeyUsage.clientAuth]),
            await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
            await x509.AuthorityKeyIdentifierExtension.create(rootKeys.publicKey),
        ],
    });

    return {
        key: keys.privateKey,
        crt: crt.toString('pem'),
    };
}

async function generateAndSave(key, alg) {
    const rootCAPath = `./ssl/${key}.rootCA.crt`;
    const rootKeyPath = `./ssl/${key}.rootKey.key`;
    const rootCrtPath = `./ssl/${key}.rootCrt.crt`;
    if (type === 'skip' && await checkFileExists(rootCAPath)) {
        return;
    }
    const root = await generateRoot(alg);
    const intermediate = await generateIntermediate(alg, root.keys);
    const promises = [];
    promises.push(
        fs.promises.writeFile(rootCAPath, root.crt, 'utf8'),
        fs.promises.writeFile(rootKeyPath, keyToPem(intermediate.key), 'utf8'),
        fs.promises.writeFile(rootCrtPath, intermediate.crt, 'utf8')
    );
    await Promise.all(promises);
}

(async () => {
    await mkdirSafe('./ssl');
    const promises = [];
    promises.push(
        generateAndSave('ecdsa-p256-sha256', {
            name: 'ECDSA',
            namedCurve: 'P-256',
            hash: 'SHA-256',
        }),
        generateAndSave('rsa-2048-sha512', {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-512',
        }),
        generateAndSave('rsa-1024-sha1', {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: 1024,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-1',
        }),
    );
    await Promise.all(promises);
})();
