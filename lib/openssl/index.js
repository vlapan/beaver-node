const fs = require('fs');
const exec = require('child_process').exec;

const hoek = require('hoek');
const async = require('async');

const config = require(`${__dirname}/../configuration`);
const logger = require(`${__dirname}/../logger`);

const generateTemplate = fs.readFileSync(`${__dirname}/templates/generate.sh`, 'UTF-8');

const availableKeySizes = [1024, 2048];
const availableSignatureAlgorithms = ['sha1', 'sha256'];

module.exports = {
    preparePreset(preset) {
        const presets = config.routing.ssl.presets;
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
        const presets = config.routing.ssl.presets;
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

        if (typeof sslRoute === 'object' && sslRoute.crt && sslRoute.key) {
            fs.writeFileSync(`${prefix}.crt`, sslRoute.crt, 'UTF-8');
            fs.writeFileSync(`${prefix}.key`, sslRoute.key, 'UTF-8');
            if (typeof callback === 'function') {
                callback(null, true);
            }
            return;
        }

        const defaultPreset = config.routing.ssl.defaultPreset;
        const presets = config.routing.ssl.presets;


        const templateKey = typeof sslRoute === 'string' ? sslRoute : defaultPreset;
        let preset = presets[templateKey];

        if (!preset) {
            if (typeof callback === 'function') {
                callback(`can not find ssl preset(${templateKey}) on route(${route})`);
            }
            return;
        }

        if (preset.extends) {
            preset = module.exports.preparePreset(preset);
        }

        const prefixRoot = `${certPath}/root-ca-${templateKey}`;
        const tempPass = preset.tempPass;
        const subjectPrefix = preset.subjectPrefix;

        const includeRootCA = preset.includeRootCA;
        const expirationDays = preset.expirationDays | 0 ? preset.expirationDays | 0 : 365;
        const keySize = preset.keySize && ~availableKeySizes.indexOf(preset.keySize | 0) ? preset.keySize | 0 : 2048;
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
            case 'subjectPrefix':
                return subjectPrefix;
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

        exec(generate, (error, stdout, stderr) => {
            if (error) {
                if (typeof callback === 'function') {
                    callback(`openssl generate: ${error}`);
                }
                return;
            }
            // console.log(error, stdout, stderr);
            if (typeof callback === 'function') {
                callback(null, true);
            }
        });
    },
};
