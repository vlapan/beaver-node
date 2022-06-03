const fs = require('fs/promises');
const path = require('path');

const async = require('async');
const globToRegExp = require('glob-to-regexp');
const { NginxConfFile } = require('nginx-conf');

const argv = require('../../argv');
const config = require('../../configuration');
const openssl = require('../../openssl');

const { certificateExpiration } = require('../../utils');
const { mkdirSafe, findFile } = require('../../utils/fs');

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
                const [, operation, key] = keyRaw.match(/(^\+|^\*|^-)?(.*)/);
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

    const authorities = config?.services?.pki?.authorities ?? {};
    const repositories = config?.services?.git?.repositories ?? {};

    const upstreamWeightDefault = (source.weight || config.routing?.options?.nginx?.weight) ?? 3;
    const maxFailsDefault = (source.maxFails || config.routing?.options?.nginx?.maxFails) ?? 5;
    const failTimeoutDefault = (source.failTimeout || config.routing?.options?.nginx?.failTimeout) ?? '15s';

    const certPath = config.routing?.options?.nginx?.certPath || argv.nginxCertPath;
    const certPathAcme = config.routing?.options?.nginx?.certPathAcme || argv.nginxCertPathAcme || `${argv.replaceHome || argv.home}/acme`;

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
                if (secure) {
                    const certValue = typeof ssl === 'string' && ssl.match(/^use:.*/) ? ssl.split(':')[1] : routeKey;
                    if (preset) {
                        if (preset.type === 'acme' || preset.type === 'acme-http-01' || preset.type === 'acme-dns-01') {
                            nserver._add('ssl_certificate', `${certPathAcme}/accounts/${preset.key}/export/host-${certValue}.crt`);
                            nserver._add('ssl_certificate_key', `${certPathAcme}/accounts/${preset.key}/export/host-${certValue}.key`);
                        } else {
                            const presetHash = openssl.sslPresetHash(certValue, preset);
                            nserver._add('ssl_certificate', `${certPath}/host-${certValue}-${presetHash}.crt`);
                            nserver._add('ssl_certificate_key', `${certPath}/host-${certValue}-${presetHash}.key`);
                        }
                    } else {
                        nserver._add('ssl_certificate', `${certPath}/host-${certValue}.crt`);
                        nserver._add('ssl_certificate_key', `${certPath}/host-${certValue}.key`);
                    }
                }

                const headers = {};
                if (typeof source.nginx === 'object') {
                    addSettings(nserver, source.nginx, headers);
                }

                if (preset && (preset.type === 'acme' || preset.type === 'acme-http-01')) {
                    const lelocation = addLocation(nserver, 'location ^~ /.well-known/acme-challenge/');
                    lelocation._add('proxy_pass', `http://127.0.0.1:${argv.httpLocalPort}`);
                }

                const addedPathnames = {};
                for (const [authorityKey, authority] of Object.entries(authorities)) {
                    const { publicUri } = authority;
                    if (publicUri) {
                        const parsed = new URL(publicUri);
                        if (parsed.hostname === routeKey && addedPathnames[parsed.pathname] !== true) {
                            addedPathnames[parsed.pathname] = true;
                            const staticLocation = addLocation(nserver, `location ^~ ${parsed.pathname}`);
                            const master = authority.master && [].concat(authority.master);
                            if (master && !~master.indexOf(config._hostname)) {
                                const servers = master.map((key) => config.parser.servers.map[key]).filter((v) => !!v);
                                if (servers.length) {
                                    staticLocation._add('proxy_pass', `https://${authorityKey}`);
                                    const upstreamLocation = addLocation(conf.nginx, `upstream ${authorityKey}`);
                                    if (upstreamLocation) {
                                        for (const server of servers) {
                                            upstreamLocation._add(`server ${server.wan3} weight=${upstreamWeightDefault} max_fails=${maxFailsDefault} fail_timeout=${failTimeoutDefault}`);
                                        }
                                    }
                                }
                            } else {
                                staticLocation._add(parsed.pathname === '/' ? 'root' : 'alias', path.resolve(`${argv.replaceHome || argv.home}/ssl-external/${authorityKey}`));
                                staticLocation._add('try_files $uri =404');
                            }
                        }
                    }
                }
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

                if (isDefault) {
                    nserver._add('return 444');
                    return;
                }

                const hasLocalhost = route.endpointsList.some((x) => x.key === config.parser.server.key);

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

                for (const item of route.endpointsList) {
                    const upstreamWeight = item.source?.upstreamWeight ?? upstreamWeightDefault;
                    const failTimeout = item.source?.failTimeout ?? failTimeoutDefault;
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
                        const targetPort = item?.routingType?.level6[secure ? 'secure' : 'plain'];
                        if (targetPort) {
                            if (hasLocalhost) {
                                if (item.key === config._hostname) {
                                    hosts.add(`server 127.0.0.1:${targetPort} weight=${upstreamWeight} max_fails=${maxFailsDefault} fail_timeout=${failTimeout}`);
                                } else {
                                    hosts.add(`server ${item.lan3 || item.wan3}:${targetPort} backup weight=${upstreamWeight} max_fails=${maxFailsDefault} fail_timeout=${failTimeout}`);
                                }
                            } else {
                                hosts.add(`server ${item.lan3 || item.wan3}:${targetPort} weight=${upstreamWeight} max_fails=${maxFailsDefault} fail_timeout=${failTimeout}`);
                            }
                            ++counter;
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
                } else if (source.static) {
                    backendLocationKey = counter === 0 ? '=404' : '@backend';
                    for (const [staticKey, staticValue] of Object.entries(source.static)) {
                        const staticLocation = addLocation(nserver, `location ${staticKey}`);

                        if (typeof staticValue.nginx === 'object') {
                            addSettings(staticLocation, staticValue.nginx, headers);
                        }
                        if (staticValue.type === 'git-static') {
                            staticLocation._add('alias', `${argv.replaceHome || argv.home}/git-static/repositories/${staticValue.repository}/${staticValue.sourcePath}`);
                        } else if (staticValue.type === 'lfs-static') {
                            staticLocation._add('alias', `${staticValue.sourcePath}`);
                        }
                        if (staticValue.indexPage) {
                            staticLocation._add('index', staticValue.indexPage);
                        }
                        if (staticValue.errorPage) {
                            staticLocation._add('error_page', `404 /${staticValue.errorPage}`);
                        }
                        if (staticValue.type) {
                            staticLocation._add(`try_files $uri $uri/ ${backendLocationKey}`);
                        }
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
                    const certificatesFiles = await findFile(certPath, /^host-.*\.crt$/);
                    const certificatesChecked = await Promise.all(certificatesFiles.map((x) => certificateExpiration(x)));
                    const certificatesUnlink = [];
                    for (const item of certificatesChecked) {
                        const { file, expired, remainingDays } = item;
                        if (expired) {
                            certificatesUnlink.push(Promise.all([
                                fs.unlink(file),
                                fs.unlink(file.replace(/\.crt$/, '.key')),
                            ]).then(() => {
                                debug(`certificate cleanup: ${file}: expiry: valid for: ${remainingDays | 0} days, unlinked`);
                            }));
                        } else {
                            debug(`certificate cleanup: ${file}: expiry: valid for: ${remainingDays | 0} days`);
                        }
                    }
                    await Promise.all(certificatesUnlink);
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
                'openssl wipe my ass': ['openssl generate certificates', async () => {
                    try {
                        await openssl.removeRootCaKeys(certPath);
                    } catch (e) {
                        console.error(e);
                        throw e;
                    }
                    debug('openssl wipe my ass: wiped!');
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
