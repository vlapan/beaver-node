const fs = require('fs');
const {exec} = require('child_process');

const hoek = require('hoek');
const async = require('async');

const config = require(`${__dirname}/../configuration`);
const logger = require(`${__dirname}/../logger`);

const generateTemplate = fs.readFileSync(`${__dirname}/templates/generate.sh`, 'UTF-8');

const availableKeySizes = [1024, 2048, 4096];
const availableSignatureAlgorithms = ['sha1', 'sha256'];

module.exports = {
    preparePreset(preset) {
        const {presets} = config.routing.ssl;
        const currentKey = preset.extends;
        const src = presets[currentKey];
        if (!currentKey || !presets[currentKey]) {
            return preset;
        }
        const parentKey = src.extends;
        if (parentKey && parentKey !== currentKey) {
            return hoek.applyToDefaults(this.preparePreset(src), preset);
        }
        return hoek.applyToDefaults(src, preset);
    },
    generateRoot(certPath, callback) {
        const {presets} = config.routing.ssl;
        const prefixRoot = `${certPath}/root-ca`;

        const tasks = [];
        for (let i = 0, keys = Object.keys(presets), till = keys.length; i < till; i += 1) {
            const key = keys[i];
            let preset = presets[key];
            if (preset.extends) {
                preset = module.exports.preparePreset(preset);
            }
            if (preset.rootCA) {
                tasks.push(fs.writeFile.bind(null, `${prefixRoot}-${key}.ca`, preset.rootCA, 'UTF-8'));
            }
            tasks.push(fs.writeFile.bind(null, `${prefixRoot}-${key}.ca-crt`, preset.rootCrt, 'UTF-8'));
            tasks.push(fs.writeFile.bind(null, `${prefixRoot}-${key}.ca-key`, preset.rootKey, 'UTF-8'));
        }
        async.parallelLimit(tasks, 4, (err) => {
            if (typeof callback === 'function') {
                callback(err);
            }
        });
    },
    generate(certPath, route, callback) {
        const prefix = `${certPath}/host-${route}`;
        const sslRoute = config.routing.routes[route] && config.routing.routes[route].ssl;

        if (sslRoute === false) {
            if (typeof callback === 'function') {
                callback(null, true);
            }
            return;
        }

        if (typeof sslRoute === 'string' && sslRoute.match(/^use:.*/)) {
            if (typeof callback === 'function') {
                callback(null, true);
            }
            return;
        }

        if (fs.existsSync(`${prefix}.crt`)) {
            if (typeof callback === 'function') {
                callback(null, true);
            }
            return;
        }

        if (typeof sslRoute === 'object' && sslRoute.crt && sslRoute.key) {
            fs.writeFileSync(`${prefix}.crt`, sslRoute.crt, 'UTF-8');
            fs.writeFileSync(`${prefix}.key`, sslRoute.key, 'UTF-8');
            if (typeof callback === 'function') {
                callback(null, true);
            }
            return;
        }

        const {defaultPreset} = config.routing.ssl;
        const {presets} = config.routing.ssl;

        const templateKey = typeof sslRoute === 'string' ? sslRoute : defaultPreset;
        let preset = presets[templateKey];

        if (!preset) {
            if (typeof callback === 'function') {
                callback(`no ssl preset(${templateKey}), route(${route})`);
            }
            return;
        }

        if (preset.extends) {
            preset = module.exports.preparePreset(preset);
        }

        const prefixRoot = `${certPath}/root-ca-${templateKey}`;
        const {tempPass} = preset;
        const {subjectPrefix} = preset;

        let subject = '';

        let subjectSuffixDNS = '';
        const sslUse = config._sslUse[route];
        if (Array.isArray(sslUse)) {
            for (let i = 0, till = sslUse.length; i < till; i++) {
                subjectSuffixDNS += `,DNS:${sslUse[i]}`;
            }
        }
        if (typeof preset.subject === 'string') {
            subject = `${preset.subject}${subjectSuffixDNS}`;
        } else if (typeof subjectPrefix === 'string' && subjectPrefix.match(/\/CN=$/)) {
            subject = subjectPrefix.replace(/\/CN=$/, `/CN=${route}/ext:subjectAltName=DNS:${route},DNS:*.${route}${subjectSuffixDNS}`);
        } else {
            if (typeof callback === 'function') {
                callback(`ssl preset(${templateKey}), no subject, route(${route})`);
            }
            return;
        }

        subject = subject.replace(/\$\{([a-z0-9]+)\}/gi, (match, p1) => {
            switch (p1) {
            case 'CN':
                return route;
            default:
                break;
            }
            return false;
        });

        const {includeRootCA} = preset;
        const expirationDays = preset.expirationDays | 0 ? preset.expirationDays | 0 : 365;
        const keySize = typeof preset.keySize === 'string' ? preset.keySize : (~availableKeySizes.indexOf(preset.keySize | 0) ? preset.keySize | 0 : 2048);
        const signatureAlgorithm = preset.signatureAlgorithm && ~availableSignatureAlgorithms.indexOf(preset.signatureAlgorithm) ? preset.signatureAlgorithm : 'sha256';
        const serial = Date.now();

        const generate = generateTemplate.replace(/%\{([a-z0-9]+)\}/gi, (match, p1) => {
            switch (p1) {
            case 'prefix':
                return prefix;
            case 'prefixRoot':
                return prefixRoot;
            case 'tempPass':
                return tempPass;
            case 'expirationDays':
                return expirationDays;
            case 'keySize':
                return keySize;
            case 'signatureAlgorithm':
                return signatureAlgorithm;
            case 'subject':
                return subject;
            case 'route':
                return route;
            case 'includeRootCA':
                return includeRootCA;
            case 'serial':
                return serial;
            default:
                break;
            }
            return false;
        });

        exec(generate, {
            shell: 'bash',
        }, (error, stdout, stderr) => {
            if (error) {
                if (typeof callback === 'function') {
                    callback(`openssl: certificate: error: ${error}`);
                }
                return;
            }
            logger.log('info', `openssl: certificate: ${route}: done.`);
            // console.log(error, stdout, stderr);
            if (typeof callback === 'function') {
                callback(null, true);
            }
        });
    },
};
