const fs = require('fs');
const { exec } = require('child_process');

const debug = require('debug')('beaver:openssl');

const config = require('../configuration');
const hash = require('../utils/hash');

const { checkFileExists } = require('../utils/fs');

const availableKeySizes = [1024, 2048, 4096];
const availableSignatureAlgorithms = ['sha1', 'sha256'];

module.exports = {
    async getTemplate() {
        if (!this.template) {
            this.template = await fs.promises.readFile(`${__dirname}/templates/generate.sh`, 'utf-8');
        }
        return this.template;
    },
    sslPresetHash(route, preset) {
        return hash({
            rootCA: preset.rootCA,
            rootCrt: preset.rootCrt,
            rootKey: preset.rootKey,
            includeRootCA: preset.includeRootCA,
            keySize: preset.keySize,
            signatureAlgorithm: preset.signatureAlgorithm,
            subject: this.getSubject(route, preset),
            email: preset.email,
        });
    },
    getPreset(route) {
        const presetKey = route.source.ssl;
        if (typeof presetKey === 'undefined') {
            const defaultPreset = config.routing.ssl.defaultPreset || 'default';
            return this.preparePreset(config.routing.ssl.presets[defaultPreset]);
        }
        if (typeof presetKey !== 'string') {
            return false;
        }
        if (presetKey.match(/^use:.*/)) {
            const parentRouteKey = presetKey.split(':')[1];
            const parentRoute = config.parser.targets.map[parentRouteKey];
            return this.getPreset(parentRoute);
        }
        if (!config.routing.ssl.presets[presetKey]) {
            return false;
        }
        return this.preparePreset(config.routing.ssl.presets[presetKey]);
    },
    preparePreset(preset) {
        const {presets} = config.routing.ssl;
        const currentKey = preset.extends;
        const src = presets[currentKey];
        if (!currentKey || !presets[currentKey]) {
            return preset;
        }
        const parentKey = src.extends;
        if (parentKey && parentKey !== currentKey) {
            return {
                ...this.preparePreset(src),
                ...preset,
            };
        }
        return {
            ...src,
            ...preset,
        };
    },
    getSubject(route, preset) {
        const {subject, subjectPrefix} = preset;
        let processedSubject = '';

        let subjectSuffixDNS = '';
        const sslUse = config._sslUse[route];
        if (Array.isArray(sslUse)) {
            for (let i = 0, till = sslUse.length; i < till; i++) {
                subjectSuffixDNS += `,DNS:${sslUse[i]}`;
            }
        }
        if (typeof subject === 'string') {
            processedSubject = `${subject}${subjectSuffixDNS}`;
        } else if (typeof subjectPrefix === 'string' && subjectPrefix.match(/\/CN=$/)) {
            processedSubject = subjectPrefix.replace(/\/CN=$/, `/CN=${route}/ext:subjectAltName=DNS:${route},DNS:*.${route}${subjectSuffixDNS}`);
        } else {
            return false;
        }

        return processedSubject.replace(/\$\{([a-z0-9]+)\}/gi, (match, p1) => {
            switch (p1) {
            case 'CN':
                return route;
            default:
                break;
            }
            return false;
        });
    },
    async generateRoot(certPath) {
        const {presets} = config.routing.ssl;
        const prefixRoot = `${certPath}/root-ca`;

        const tasks = [];
        for (let i = 0, keys = Object.keys(presets), till = keys.length; i < till; i += 1) {
            const key = keys[i];
            let preset = presets[key];
            if (typeof preset.type === 'undefined' || preset.type === 'openssl') {
                if (preset.extends) {
                    preset = module.exports.preparePreset(preset);
                }
                if (preset.rootCA) {
                    tasks.push(fs.promises.writeFile(`${prefixRoot}-${key}.ca`, preset.rootCA));
                }
                if (preset.rootCrt && preset.rootKey) {
                    tasks.push(fs.promises.writeFile(`${prefixRoot}-${key}.ca-crt`, preset.rootCrt));
                    tasks.push(fs.promises.writeFile(`${prefixRoot}-${key}.ca-key`, preset.rootKey));
                }
            }
        }
        return Promise.all(tasks);
    },
    async generate(conf, route) {
        const { certPath } = conf;
        let prefix = `${certPath}/host-${route}`;
        const sslRoute = config.parser.targets.source[route] && config.parser.targets.source[route].ssl;

        if (sslRoute === false) {
            return Promise.resolve();
        }

        if (typeof sslRoute === 'string' && sslRoute.match(/^use:.*/)) {
            return Promise.resolve();
        }

        if (typeof sslRoute === 'object' && sslRoute.crt && sslRoute.key) {
            return Promise.all([
                fs.promises.writeFile(`${prefix}.crt`, sslRoute.crt),
                fs.promises.writeFile(`${prefix}.key`, sslRoute.key),
            ]).then(() => {
                debug(`write static ${route}: done`);
            });
        }

        const defaultPreset = config.routing.ssl.defaultPreset || 'default';
        const { presets } = config.routing.ssl;

        let templateKey = typeof sslRoute === 'string' ? sslRoute : defaultPreset;

        let preset = presets[templateKey];

        if (!preset) {
            throw new Error(`no ssl preset(${templateKey}), route(${route})`);
        }

        // TODO: fix me
        if (preset.type === 'acme' || preset.type === 'acme-http-01' || preset.type === 'acme-dns-01') {
            templateKey = defaultPreset;
            preset = presets[templateKey];
        }

        if (preset.extends) {
            preset = module.exports.preparePreset(preset);
        }
        const prefixRoot = !conf.rootPath ? `${certPath}/root-ca-${templateKey}` : `${conf.rootPath}/root-ca-${templateKey}`;
        const { tempPass } = preset;

        const subject = module.exports.getSubject(route, preset);
        if (!subject) {
            throw new Error(`ssl preset(${templateKey}), no subject, route(${route})`);
        }
        if (typeof conf.appendHash === 'undefined' || conf.appendHash === true) {
            const presetHash = module.exports.sslPresetHash(route, preset);
            prefix = `${prefix}-${presetHash}`;
        }

        if (await checkFileExists(`${prefix}.crt`)) {
            return Promise.resolve();
        }

        const { includeRootCA } = preset;
        const expirationDays = preset.expirationDays | 0 ? preset.expirationDays | 0 : 365;
        const keySize = typeof preset.keySize === 'string' ? preset.keySize : (~availableKeySizes.indexOf(preset.keySize | 0) ? preset.keySize | 0 : 4096);
        const signatureAlgorithm = preset.signatureAlgorithm && ~availableSignatureAlgorithms.indexOf(preset.signatureAlgorithm) ? preset.signatureAlgorithm : 'sha256';
        const serial = Date.now();

        const generate = (await this.getTemplate()).replace(/%\{([a-z0-9]+)\}/gi, (match, p1) => {
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

        try {
            await new Promise(resolve => {
                exec(generate, {
                    shell: 'bash',
                }, (error, stdout, stderr) => {
                    if (error) {
                        resolve(Promise.reject(new Error(error)));
                        return;
                    }
                    debug(`generate ${route}: done`);
                    resolve();
                });
            });
        } catch (e) {
            debug(`generate ${route}: failed`);
        }
        return Promise.resolve();
    },
};
