const fs = require('fs/promises');
const path = require('path');
const util = require('util');

const sslUtil = require('ssl-utils');
const async = require('async');
const globToRegExp = require('glob-to-regexp');
const { NginxConfFile } = require('nginx-conf');

const argv = require('../../argv');
const config = require('../../configuration');
const openssl = require('../../openssl');

const sslext = require('../ssl');

const { mkdirSafe } = require('../../utils/fs');

function addLocation(root, key) {
    let location = root[key];
    if (location && location.length) {
        return false;
    }
    root._add(key);
    location = root[key];
    if (location.length) {
        location = location[location.length - 1];
    }
    return location;
}

function addSettings(root, settings, headers = {}) {
    // "match" should be last one
    const settingsSorted = Object.entries(settings).sort((a, b) => {
        return a[0] === 'match' ? 1 : (b[0] === 'match' ? -1 : 0);
    });
    for (const [settingKey, settingValue] of settingsSorted) {
        if (settingKey === 'match') {
            for (const [matchKey, matchValue] of Object.entries(settingValue)) {
                const regexp = globToRegExp(matchKey, {
                    extended: true,
                }).toString();
                const matchLocation = addLocation(root, `location ~ ${regexp.substring(2, regexp.length - 1)}`);
                addSettings(matchLocation, matchValue, headers);
            }
        } else if (settingKey === 'add_header') {
            for (const item of [].concat(settingValue)) {
                const [keyRaw, ...values] = item.split(' ');
                const [, operation, key] = keyRaw.match(/(^\+|^\*|^\-)?(.*)/);
                const value = values.join(' ');
                if (operation === '+') {
                    headers[key] = (headers[key] ?? []).concat(value);
                } else if (operation === '-') {
                    headers[key] = [];
                } else {
                    headers[key] = [value];
                }
            }
            for (const [key, list] of Object.entries(headers)) {
                for (const value of list) {
                    root._add(settingKey, `${key} ${value}`);
                }
            }
        } else {
            for (const item of [].concat(settingValue)) {
                root._add(settingKey, item);
            }
        }
    }
}

function getMergedTargetSource(source) {
    if (typeof source.extends === 'string') {
        const parent = config.parser.targets.map[source.extends];
        if (parent) {
            return { ...getMergedTargetSource(parent.source), ...source };
        }
    }
    return source;
}

async function generateFile(route, routePath) {
    const routeKey = route.key;
    const isDefault = routeKey === 'default';

    const source = getMergedTargetSource(route.source);
    const { ssl } = source;
    const preset = openssl.getPreset(route);

    const repositories = config.services && config.services.git && config.services.git.repositories || {};

    const upstreamWeightDefault = source.weight || (config.routing.options.nginx && config.routing.options.nginx.weight) || 3;
    const maxFailsDefault = source.maxFails || (config.routing.options.nginx && config.routing.options.nginx.maxFails) || 5;
    const failTimeoutDefault = source.failTimeout || (config.routing.options.nginx && config.routing.options.nginx.failTimeout) || '15s';

    (await fs.open(routePath, 'w')).close();

    await new Promise(resolve => {
        NginxConfFile.create(routePath, (err, conf) => {
            if (err) {
                throw new Error(err);
            }

            conf.on('flushed', () => {
                resolve();
            });
            conf.die(routePath);

            function makeHost(port, secure) {
                let nserver = conf.nginx._add('server').server;
                if (nserver.length) {
                    nserver = nserver[nserver.length - 1];
                }

                const listen = `${port}${isDefault ? ' default_server' : ''}${secure ? ' ssl http2' : ''}`;
                nserver._add('listen', listen);
                nserver._add('listen', `[::]:${listen}`);

                nserver._add('server_name', isDefault ? '_' : `${routeKey} *.${routeKey}`);

                const headers = {};
                if (typeof source.nginx === 'object') {
                    addSettings(nserver, source.nginx, headers);
                }

                if (preset && (preset.type === 'acme' || preset.type === 'acme-http-01')) {
                    const lelocation = addLocation(nserver, 'location ^~ /.well-known/acme-challenge/');
                    lelocation._add('proxy_pass', `http://127.0.0.1:${argv.httpLocalPort}`);
                }

                const addedPathnames = {};
                for (const repository of Object.values(repositories)) {
                    const { updateHook } = repository;
                    if (updateHook) {
                        const parsed = new URL(updateHook);
                        if (parsed.hostname === routeKey && addedPathnames[parsed.pathname] !== true) {
                            addedPathnames[parsed.pathname] = true;
                            const repoLocation = addLocation(nserver, `location = ${parsed.pathname}`);
                            repoLocation._add('proxy_pass', `http://127.0.0.1:${argv.httpGitStaticPort}`);
                        }
                    }
                }

                if (secure) {
                    const certValue = typeof ssl === 'string' && ssl.match(/^use:.*/) ? ssl.split(':')[1] : routeKey;
                    if (preset) {
                        if (preset.type === 'acme' || preset.type === 'acme-http-01' || preset.type === 'acme-dns-01') {
                            nserver._add('ssl_certificate', `${argv.home}/acme/accounts/${preset.key}/export/host-${certValue}.crt`);
                            nserver._add('ssl_certificate_key', `${argv.home}/acme/accounts/${preset.key}/export/host-${certValue}.key`);
                        } else {
                            const presetHash = openssl.sslPresetHash(certValue, preset);
                            nserver._add('ssl_certificate', `cert/host-${certValue}-${presetHash}.crt`);
                            nserver._add('ssl_certificate_key', `cert/host-${certValue}-${presetHash}.key`);
                        }
                    } else {
                        nserver._add('ssl_certificate', `cert/host-${certValue}.crt`);
                        nserver._add('ssl_certificate_key', `cert/host-${certValue}.key`);
                    }
                }

                if (isDefault) {
                    nserver._add('return 444');
                    return;
                }

                const target = route.endpointsList;

                const protocol = secure ? 'https' : 'http';
                const key = routeKey.replace(/\./gi, '_');
                let staticProtocol = protocol;

                const hosts = new Set();
                const hostsExternal = new Set();
                const rewrites = new Set();

                let external = false;
                let counter = 0;

                let flag = false;
                let rewriteFinal = false;

                for (const item of target) {
                    const upstreamWeight = item.source.upstreamWeight ? item.source.upstreamWeight : upstreamWeightDefault;
                    const failTimeout = item.source.failTimeout ? item.source.failTimeout : failTimeoutDefault;
                    if (item.TargetStatic) {
                        const url = item[secure ? 'proxyHttps' : 'proxyHttp'];
                        const redirect = item.source[secure ? 'redirectHttps' : 'redirectHttp'];
                        if (typeof redirect === 'string') {
                            rewrites.add(`return 307 ${redirect}`);
                            rewriteFinal = true;
                            ++counter;
                        } else if ((url === true || redirect === true) && !secure) {
                            rewrites.add('return 308 https://$server_name$request_uri');
                            rewriteFinal = true;
                            ++counter;
                        } else if (typeof url === 'string' && url !== '') {
                            flag = true;
                            const urlProtocol = url.substring(0, url.indexOf('://'));
                            if (urlProtocol !== protocol) {
                                staticProtocol = urlProtocol;
                            }
                            const uri = url.substring(url.indexOf('://') + 3);
                            const hasBackups = route.hasLocalEndpoints;
                            const backup = hasBackups && item.isRemote;
                            hosts.add(`server ${uri} weight=${upstreamWeight} max_fails=${maxFailsDefault} fail_timeout=${failTimeout}${backup ? ' backup' : ''}`);
                            ++counter;
                        }
                    } else if (!item.location || item.location === config.parser.location) {
                        const level6 = (item.routingType || {}).level6;
                        if (level6) {
                            const targetPort = (level6 || {})[secure ? 'secure' : 'plain'];
                            if (targetPort) {
                                hosts.add(`server ${item.lan3 || item.wan3}:${targetPort} weight=${upstreamWeight} max_fails=${maxFailsDefault} fail_timeout=${failTimeout}`);
                                ++counter;
                            }
                        }
                    } else {
                        const hasLocal = route.hasLocalEndpoints && ((item.routingType || {}).level6 || {})[secure ? 'secure' : 'plain'];
                        const backup = hasLocal && !secure ? ' backup' : '';
                        const maxFails = backup ? 3 : maxFailsDefault;
                        if (hasLocal && secure && !external) {
                            hosts.add(`server 127.0.0.1:81 weight=${upstreamWeight} max_fails=3 fail_timeout=${failTimeout} backup`);
                            ++counter;
                        }

                        const list = hasLocal && secure ? hostsExternal : hosts;
                        if (hasLocal && secure && item.wan3) {
                            list.add(`server ${item.wan3}:443 weight=${upstreamWeight} max_fails=${maxFails} fail_timeout=${failTimeout}`);
                            ++counter;
                        } else {
                            const { location } = item;
                            const wan3 = (location && location.wan3) || item.wan3;
                            if (wan3) {
                                for (const ip of [].concat(wan3)) {
                                    list.add(`server ${ip}:${secure ? 443 : 80} weight=${upstreamWeight} max_fails=${maxFails} fail_timeout=${failTimeout}${backup}`);
                                    ++counter;
                                }
                            }
                        }
                        external = true;
                    }
                }

                let backendLocationKey = '/';
                if (source.root) {
                    backendLocationKey = counter === 0 ? '=404' : '@backend';
                    nserver._add('root', source.root);
                    const staticLocation = addLocation(nserver, 'location /');
                    staticLocation._add(`try_files $uri ${backendLocationKey}`);
                } else if (source.pki) {
                    const externalLocations = sslext.getExternalLocations(config);
                    for (const [key, value] of Object.entries(externalLocations)) {
                        const staticLocation = addLocation(nserver, `location = /${key}`);
                        if (value.local) {
                            staticLocation._add('root', path.resolve(`${argv.home}/ssl-external`));
                            staticLocation._add('try_files $uri.crt =404');
                        } else {
                            staticLocation._add('proxy_pass', `http://${key}`);
                            const upstreamLocation = addLocation(conf.nginx, `upstream ${key}`);
                            if (upstreamLocation) {
                                for (const master of value.master) {
                                    upstreamLocation._add(`server ${master.wan3} weight=${upstreamWeightDefault} max_fails=${maxFailsDefault} fail_timeout=${failTimeoutDefault}`);
                                }
                            }
                        }
                    }
                } else if (source.static) {
                    backendLocationKey = counter === 0 ? '=404' : '@backend';
                    for (const [staticKey, staticValue] of Object.entries(source.static)) {
                        const staticLocation = addLocation(nserver, `location ${staticKey}`);

                        if (typeof staticValue.nginx === 'object') {
                            addSettings(staticLocation, staticValue.nginx, headers);
                        }
                        if (staticValue.type === 'git-static') {
                            staticLocation._add('alias', `${argv.home}/git-static/repositories/${staticValue.repository}/${staticValue.sourcePath}`);
                        } else {
                            staticLocation._add('alias', `${staticValue.sourcePath}`);
                        }
                        if (staticValue.indexPage) {
                            staticLocation._add('index', staticValue.indexPage);
                        }
                        if (staticValue.errorPage) {
                            staticLocation._add('error_page', `404 /${staticValue.errorPage}`);
                        }
                        staticLocation._add(`try_files $uri $uri/ ${backendLocationKey}`);
                    }
                }

                if (counter === 0) {
                    return;
                }

                const locationKey = `location ${backendLocationKey}`;
                let nlocation = nserver[locationKey];
                if (!nlocation) {
                    nserver._add(locationKey);
                    nlocation = nserver[locationKey];
                    if (nlocation.length) {
                        nlocation = nlocation[nlocation.length - 1];
                    }
                }

                if (rewrites.size) {
                    rewrites.forEach((item) => {
                        nlocation._add(item);
                    });
                    if (rewriteFinal) {
                        return;
                    }
                }

                nlocation._add('proxy_pass', `${flag ? staticProtocol : (route.hasLocalEndpoints || !secure ? 'http' : 'https')}://${key}_${protocol}`);

                if (!hosts.size) {
                    return;
                }
                let upstream = conf.nginx[`upstream ${key}_${protocol}`];
                if (!upstream) {
                    conf.nginx._add(`upstream ${key}_${protocol}`);
                    upstream = conf.nginx[`upstream ${key}_${protocol}`];
                    if (upstream.length) {
                        upstream = upstream[upstream.length - 1];
                    }
                }
                // upstream._add('keepalive', '8');

                hosts.forEach((item) => {
                    upstream._add(item);
                });

                if (hostsExternal.size) {
                    let nserver = conf.nginx._add('server').server;
                    if (nserver.length) {
                        nserver = nserver[nserver.length - 1];
                    }

                    nserver._add('listen', '127.0.0.1:81');
                    nserver._add('server_name', `${routeKey} *.${routeKey}`);
                    nserver._add('# large transfers hang with bigger buffer values (nginx bug?)');
                    nserver._add('proxy_buffering', 'off');
                    nserver._add('proxy_buffer_size', '2k');
                    nserver._add('proxy_buffers', '32 2k');

                    let nlocation = nserver['location /'];
                    if (!nlocation) {
                        nserver._add('location /');
                        nlocation = nserver['location /'];
                        if (nlocation.length) {
                            nlocation = nlocation[nlocation.length - 1];
                        }
                    }

                    nlocation._add('proxy_pass', `https://${key}_${protocol}_backup`);

                    let upstream = conf.nginx[`upstream ${key}_${protocol}_backup`];
                    if (!upstream) {
                        conf.nginx._add(`upstream ${key}_${protocol}_backup`);
                        upstream = conf.nginx[`upstream ${key}_${protocol}_backup`];
                        if (upstream.length) {
                            upstream = upstream[upstream.length - 1];
                        }
                    }
                    // upstream._add('keepalive', '8');

                    hostsExternal.forEach((item) => {
                        upstream._add(item);
                    });
                }
            }

            makeHost(80);
            if (source.ssl !== false) {
                makeHost(443, true);
            }

            conf.live(routePath);
            conf.flush();
        });
    });
}

module.exports = {
    async generate(o) {
        const debug = o.debug.extend('nginx');
        debug('start');

        const nginxPath = path.normalize(`${config._outputPath}/nginx`);
        await mkdirSafe(nginxPath);
        const siteEnabledPath = path.normalize(`${nginxPath}/sites-enabled`);
        await mkdirSafe(siteEnabledPath);

        const jobs = {};

        const sslOn = config.routing.ssl && config.routing.ssl.defaultPreset && config.routing.ssl.presets && !argv.fastBuild;
        if (sslOn) {
            const certPath = path.normalize(`${nginxPath}/cert`);
            await mkdirSafe(certPath);
            const acmePath = `${argv.home}/acme`;
            await mkdirSafe(acmePath);
            const accountsPath = `${acmePath}/accounts`;
            await mkdirSafe(accountsPath);

            Object.assign(jobs, {
                'generate root certificates': async () => {
                    try {
                        await openssl.generateRoot(certPath);
                    } catch (e) {
                        console.error(e);
                        throw e;
                    }
                    debug('generate root certificates: done');
                },
                'openssl check certificates': async () => {
                    for (const file of await fs.readdir(`${certPath}`)) {
                        if (!file.match(/^host-.*\.crt$/)) {
                            continue;
                        }
                        const filePath = `${certPath}/${file}`;
                        const fileData = await fs.readFile(filePath);
                        const check = util.promisify(sslUtil.checkCertificateExpiration);
                        const expiry = await check(fileData);
                        const remainingTime = expiry.getTime() - Date.now();
                        const remainingDays = remainingTime / (1000 * 60 * 60 * 24);
                        const expired = remainingDays < 30;
                        debug(`certificate: ${file}: expiry: valid for: ${remainingDays | 0} days`);
                        if (expired) {
                            await fs.unlink(filePath);
                            await fs.unlink(`${certPath}/${file.replace(/\.crt$/, '.key')}`);
                            debug(`certificate: ${file}: expiry: unlink: done.`);
                        }
                    }
                    debug('openssl check certificates: done');
                },
                'openssl generate certificates': ['openssl check certificates', async () => {
                    const tasks = [];
                    for (const [routeKey, route] of Object.entries(config.parser.targets.map)) {
                        const preset = openssl.getPreset(route);
                        if (preset && (preset.type === 'acme' || preset.type === 'acme-http-01' || preset.type === 'acme-dns-01')) {
                            const accountPath = `${accountsPath}/${preset.key}`;
                            const exportPath = `${accountPath}/export`;
                            await mkdirSafe(exportPath);
                            tasks.push(openssl.generate.bind(openssl, {
                                certPath: exportPath,
                                rootPath: certPath,
                                appendHash: false,
                            }, routeKey));
                        } else {
                            tasks.push(openssl.generate.bind(openssl, {
                                certPath,
                            }, routeKey));
                        }
                    }
                    try {
                        await async.parallelLimit(tasks, 4);
                    } catch (e) {
                        console.error(e);
                        throw e;
                    }
                    debug('openssl generate certificates: done');
                }],
            });
        }

        Object.assign(jobs, {
            'generate config files': async () => {
                await async.each(config.parser.targetListWeb, async (target) => {
                    const routePath = path.normalize(`${siteEnabledPath}/${target.key}.conf`);
                    await generateFile(target, routePath, { ...o, debug });
                    debug(`config: ${target.key}: done`);
                });
                debug('configs: done');
            },
        });

        await async.auto(jobs);
        debug('done');
    },
};
