const fs = require('fs');
const { exec } = require('child_process');

const debug = require('debug')('beaver:openssl');

const config = require('../configuration');
const hash = require('../utils/hash');

const { checkFileExists } = require('../utils/fs');

const availableKeySizes = [1024, 2048, 4096];
const availableSignatureAlgorithms = ['sha1', 'sha256'];
const acmePresets = ['acme', 'acme-http-01', 'acme-dns-01'];

module.exports = {
    async getTemplate() {
        if (!this.template) {
            this.template = await fs.promises.readFile(`${__dirname}/templates/generate.sh`, 'utf-8');
        }
        return this.template;
    },
    async getCSRTemplate() {
        if (!this.CSRtemplate) {
            this.CSRtemplate = await fs.promises.readFile(`${__dirname}/templates/csrSign.sh`, 'utf-8');
        }
        return this.CSRtemplate;
    },
    getKeySize(preset) {
        if (typeof preset.keySize === 'string') {
            return preset.keySize;
        }
        return ~availableKeySizes.indexOf(preset.keySize | 0) ? preset.keySize | 0 : 4096;
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
        const presetKey = typeof route === 'object' ? route?.source?.ssl : route;
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
        const preset = config.routing.ssl.presets[presetKey];
        if (!preset) {
            return false;
        }
        const result = this.preparePreset(preset);
        const acmeAny = acmePresets.includes(result.type);
        const acmeDns = acmeAny && result.type.startsWith('acme-dns');
        const acmeHttp = acmeAny && (result.type.startsWith('acme-http') || result.type === 'acme');
        return {
            ...result,
            key: presetKey,
            acmeAny,
            acmeDns,
            acmeHttp,
        };
    },
    preparePreset(preset) {
        const { presets } = config.routing.ssl;
        const currentKey = preset.extends;
        const src = presets[currentKey];
        if (!currentKey || !src) {
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
        const { subject, subjectPrefix } = preset;
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
        const { presets } = config.routing.ssl;
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
    async removeRootCaKeys(certPath) {
        const { presets } = config.routing.ssl;
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
                    // tasks.push(fs.promises.writeFile(`${prefixRoot}-${key}.ca`, preset.rootCA));
                }
                if (preset.rootCrt && preset.rootKey) {
                    // tasks.push(fs.promises.writeFile(`${prefixRoot}-${key}.ca-crt`, preset.rootCrt));
                    tasks.push(fs.promises.unlink(`${prefixRoot}-${key}.ca-key`));
                }
            }
        }
        return Promise.all(tasks);
    },
    async signCSR(csr, preset, prefix) {
        if (preset.acmeAny) {
            return false;
        }

        const { includeRootCA } = preset;
        const expirationDays = preset.expirationDays | 0 ? preset.expirationDays | 0 : 365;
        const keySize = this.getKeySize(preset);
        const signatureAlgorithm = preset.signatureAlgorithm && ~availableSignatureAlgorithms.indexOf(preset.signatureAlgorithm) ? preset.signatureAlgorithm : 'sha256';
        const serial = Date.now();
        const template = await this.getCSRTemplate();

        await new Promise((resolve, reject) => {
            exec(template, {
                shell: 'bash',
                env: {
                    NAME: prefix,
                    CSR: csr,
                    RTCA: preset.rootCA,
                    IMCT: preset.rootCrt,
                    IMKY: preset.rootKey,
                    DAYS: expirationDays,
                    KEYSIZE: keySize,
                    ALGM: signatureAlgorithm,
                    INCLUDEROOTCA: includeRootCA,
                    SERIAL: serial,
                },
            }, (error, stdout, stderr) => {
                // console.log(error, stdout, stderr);
                if (error) {
                    reject(new Error(error));
                    return;
                }
                resolve();
            });
        });
    },
    async generate(conf, route) {
        const { certPath } = conf;
        let prefix = `${certPath}/host-${route}`;
        const routeObj = config.parser.targets.map[route];
        const sslRoute = routeObj && routeObj.source.ssl;

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

        let preset = this.getPreset(templateKey);

        if (!preset) {
            throw new Error(`no ssl preset(${templateKey}), route(${route})`);
        }

        if (preset.acmeAny) {
            templateKey = defaultPreset;
            preset = this.preparePreset(presets[templateKey]);
        }

        if (preset.extends) {
            preset = this.preparePreset(preset);
        }
        const prefixRoot = conf.rootPath ? `${conf.rootPath}/root-ca-${templateKey}` : `${certPath}/root-ca-${templateKey}`;
        const { tempPass } = preset;

        const subject = this.getSubject(route, preset);
        if (!subject) {
            throw new Error(`ssl preset(${templateKey}), no subject, route(${route})`);
        }
        if (typeof conf.appendHash === 'undefined' || conf.appendHash === true) {
            const presetHash = this.sslPresetHash(route, preset);
            prefix = `${prefix}-${presetHash}`;
        }

        if (await checkFileExists(`${prefix}.crt`)) {
            return Promise.resolve();
        }

        const { includeRootCA } = preset;
        const expirationDays = preset.expirationDays | 0 ? preset.expirationDays | 0 : 365;
        const keySize = this.getKeySize(preset);
        const signatureAlgorithm = preset.signatureAlgorithm && ~availableSignatureAlgorithms.indexOf(preset.signatureAlgorithm) ? preset.signatureAlgorithm : 'sha256';
        const serial = Date.now();

        const template = await this.getTemplate();
        const generate = template.replace(/%\{([a-z0-9]+)\}/gi, (match, p1) => {
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
            throw e;
        }
        return Promise.resolve();
    },
};
