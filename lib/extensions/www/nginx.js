const fs = require('node:fs/promises');
const path = require('node:path');

const async = require('async');
const globToRegExp = require('glob-to-regexp');
const { NginxConfFile } = require('nginx-conf');

const argv = require('../../argv');
const config = require('../../configuration');
const openssl = require('../../openssl');

const { certificateExpirationFile, isPlainObject } = require('../../utils');
const { mkdirSafe, findFile } = require('../../utils/fs');
const { parseAcls } = require('../../utils/structure');
const { file, columnize } = require('../../utils/tpl');
const getHash = require('../../utils/hash');

function addLocation(root, key) {
    let location = root[key];
    if (location && location.length > 0) {
        return false;
    }
    root._add(key);
    location = root[key];
    if (location.length > 0) {
        location = location.at(-1);
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
            for (const item of [settingValue].flat()) {
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
            for (const item of [settingValue].flat()) {
                if (isPlainObject(item) && item?.value !== undefined) {
                    root._add(settingKey, `${item.value};${item.comment ? `${' '.repeat(item.valueMaxLength - item.value.length)} # ${item.comment}` : ''}`);
                } else {
                    root._add(settingKey, item);
                }
            }
        }
    }
}

function getMergedTargetSource(source) {
    if (typeof source.extends === 'string') {
        const parent = config.parser.targets.map[source.extends];
        if (parent) {
            return {
                ...getMergedTargetSource(parent.source),
                ...source,
            };
        }
    }
    return source;
}

async function generateFile(route, routePath, o) {
    const routeKey = route.key;
    const isDefault = routeKey === 'default';

    const source = getMergedTargetSource(route.source);
    const { ssl } = source;

    const authorities = config?.services?.pki?.authorities ?? {};
    const repositories = config?.services?.git?.repositories ?? {};

    const redirectFromHttp = (source.redirectHttp === true || source.proxyHttp === true);

    const http2Value = (source?.nginx?.http2 || config.routing?.options?.nginx?.http2) ?? 'on';
    delete source?.nginx?.http2;

    const trust = source?.trust;
    const trustValue = [trust].flat();
    const trustMapVarName = `beaver_xff_map_${getHash(trustValue.sort())}`;
    if (trust) {
        const mapPath = path.normalize(`${o.mapsPath}/${trustMapVarName}.conf`);
        generateXFFMapConfig({
            config,
            mapPath,
            defaultVarName: 'beaver_xff_map',
            mainVarName: trustMapVarName,
            trust: trustValue,
        }).then(() => {
            return o.debug(`map(${trustMapVarName}) config for ${route}: done`);
        }).catch((e) => {
            throw e;
        });
    }


    const upstreamWeightDefault = (source.weight || config.routing?.options?.nginx?.weight) ?? 3;
    const maxFailsDefault = (source.maxFails || config.routing?.options?.nginx?.maxFails) ?? 5;
    const failTimeoutDefault = (source.failTimeout || config.routing?.options?.nginx?.failTimeout) ?? '15s';

    const certPath = config.routing?.options?.nginx?.certPath || argv.nginxCertPath;

    (await fs.open(routePath, 'w')).close();

    await new Promise((resolve) => {
        NginxConfFile.create(routePath, (err, conf) => {
            if (err) {
                throw new Error(err);
            }

            conf.on('flushed', () => {
                resolve();
            });
            conf.die(routePath);

            function makeHost({
                port,
                secure,
                internal,
                noWildcard,
                onlyWildcard,
            }) {
                let nserver = conf.nginx._add('server').server;
                if (nserver.length > 0) {
                    nserver = nserver.at(-1);
                }

                const listen = `${port}${isDefault ? ' default_server' : ''}${secure ? ' ssl' : ''}`;
                nserver._add('listen', listen);
                nserver._add('listen', `[::]:${listen}`);
                if (secure) {
                    nserver._add('http2', http2Value);
                }

                const serverNames = [];
                if (isDefault) {
                    serverNames.push('_');
                } else {
                    if (onlyWildcard !== true) {
                        serverNames.push(routeKey);
                    }
                    if (!noWildcard) {
                        serverNames.push(`*.${routeKey}`);
                    }
                }
                nserver._add('server_name', serverNames.join(' '));
                if (secure) {
                    const certValue = typeof ssl === 'string' && ssl.match(/^use:.*/) ? ssl.split(':')[1] : routeKey;
                    nserver._add('ssl_certificate', `${certPath}/host-${certValue}.crt`);
                    nserver._add('ssl_certificate_key', `${certPath}/host-${certValue}.key`);
                }

                const lelocation = addLocation(nserver, 'location ^~ /.well-known/acme-challenge/');
                lelocation._add('allow', 'all');
                lelocation._add('proxy_pass', `http://127.0.0.1:${argv.httpLocalPort}`);

                const addedPathnames = {};
                for (const [authorityKey, authority] of Object.entries(authorities)) {
                    const { publicUri } = authority;
                    if (publicUri) {
                        const parsed = new URL(publicUri);
                        if (parsed.hostname === routeKey && addedPathnames[parsed.pathname] !== true) {
                            addedPathnames[parsed.pathname] = true;
                            const staticLocation = addLocation(nserver, `location ^~ ${parsed.pathname}`);
                            const master = authority.master && [authority.master].flat();
                            if (master && !~master.indexOf(config._hostname)) {
                                const servers = master.map((key) => config.parser.servers.map[key]).filter((v) => !!v);
                                if (servers.length > 0) {
                                    staticLocation._add('proxy_pass', `http://${authorityKey}`);
                                    const upstreamLocation = addLocation(conf.nginx, `upstream ${authorityKey}`);
                                    if (upstreamLocation) {
                                        for (const server of servers) {
                                            upstreamLocation._add(`server ${server.wan3} weight=${upstreamWeightDefault} max_fails=${maxFailsDefault} fail_timeout=${failTimeoutDefault}`);
                                        }
                                    }
                                }
                            } else {
                                staticLocation._add(parsed.pathname === '/' ? 'root' : 'alias', path.resolve(`${argv.replaceHome || argv.home}/ssl-external/${authorityKey}`) + (parsed.pathname === '/' ? '' : '/'));
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
                            repoLocation._add('allow', 'all');
                            repoLocation._add('proxy_pass', `http://localhost:${argv.httpGitStaticPort}`);
                        }
                    }
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

                const redirectHttps = !secure && redirectFromHttp;
                if (redirectHttps) {
                    rewrites.add('return 308 https://$host$request_uri');
                    rewriteFinal = true;
                    ++counter;
                }

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
                        // } else if ((url === true || redirect === true) && !secure) {
                        //     rewrites.add('return 308 https://$host$request_uri');
                        //     rewriteFinal = true;
                        //     ++counter;
                        } else if (typeof url === 'string' && url !== '') {
                            flag = true;
                            const urlProtocol = url.substring(0, url.indexOf('://'));
                            if (urlProtocol !== protocol) {
                                staticProtocol = urlProtocol;
                            }
                            const uri = url.substring(url.indexOf('://') + 3);
                            const hasLocal = route.hasLocalEndpoints;
                            const backup = hasLocal && item.isRemote;
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
                        const hasLocal = route.hasLocalEndpoints && item.routingType?.level6?.[secure ? 'secure' : 'plain'];
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
                                for (const ip of [wan3].flat()) {
                                    list.add(`server ${ip}:${secure ? 443 : 80} weight=${upstreamWeight} max_fails=${maxFails} fail_timeout=${failTimeout}${backup}`);
                                    ++counter;
                                }
                            }
                        }
                        external = true;
                    }
                }

                const headers = {};
                if (!redirectHttps) {
                    if (typeof source.nginx === 'object') {
                        let nginx = {
                            ...source.nginx,
                        };
                        if (nginx.allow) {
                            const allowList = parseAcls(config.parser, new Set([nginx.allow].flat().filter(Boolean)));
                            const max = Math.max.apply(undefined, allowList.map((x) => x.value.length));
                            nginx.allow = allowList.map((x) => {
                                x.valueMaxLength = max;
                                return x;
                            });
                        }
                        if (nginx.deny) {
                            const denyList = parseAcls(config.parser, new Set([nginx.deny].flat().filter(Boolean)));
                            const max = Math.max.apply(undefined, denyList.map((x) => x.value.length));
                            nginx.deny = denyList.map((x) => {
                                x.valueMaxLength = max;
                                return x;
                            });
                        }
                        addSettings(nserver, nginx, headers);
                    }
                    if (source.access && !source?.nginx?.allow && !source?.nginx?.deny) {
                        const allowList = parseAcls(config.parser, new Set([source.access].flat().filter(Boolean)));
                        const max = Math.max.apply(undefined, allowList.map((x) => x.value.length));
                        addSettings(nserver, {
                            allow: allowList.map((x) => {
                                x.valueMaxLength = max;
                                return x;
                            }),
                            deny: 'all',
                        }, headers);
                    }
                    if (trust) {
                        addSettings(nserver, {
                            proxy_set_header: `X-Forwarded-For $${trustMapVarName}`,
                        }, headers);
                    }
                }

                const proxyPassUrl = `${flag ? staticProtocol : (route.hasLocalEndpoints || !secure ? 'http' : 'https')}://${key}_${protocol}`;
                const backendExists = !rewriteFinal && counter !== 0;
                let backendLocationKey = '/';

                if (source.root && !redirectHttps) {
                    backendLocationKey = backendExists ? '@backend' : '=404';
                    nserver._add('root', source.root);
                    if (backendExists) {
                        const rootLocation = addLocation(nserver, 'location = /');
                        rootLocation._add(`try_files /dev/null ${backendLocationKey}`);
                    }
                    const staticLocation = addLocation(nserver, 'location /');
                    staticLocation._add(`try_files $uri ${backendLocationKey}`);
                } else if (source.static && !redirectHttps && !internal) {
                    backendLocationKey = backendExists ? '@backend' : '=404';
                    for (const [staticKey, staticValue] of Object.entries(source.static)) {
                        const staticLocation = addLocation(nserver, `location ${staticKey}`);
                        if (typeof staticValue.nginx === 'object') {
                            addSettings(staticLocation, staticValue.nginx, headers);
                        }
                        if (staticValue.type === 'git-static') {
                            staticLocation._add('alias', `${argv.replaceHome || argv.home}/git-static/repositories/${staticValue.repository}/${staticValue.sourcePath}`);
                        } else if (staticValue.type === 'lfs-static' && staticValue.sourcePath) {
                            staticLocation._add('alias', staticValue.sourcePath);
                        }
                        if (staticValue.indexPage) {
                            staticLocation._add('index', staticValue.indexPage);
                        }
                        if (staticValue.errorPage) {
                            const errors = [];
                            if (Array.isArray(staticValue.errorPage)) {
                                for (const x of staticValue.errorPage) {
                                    errors.push(x);
                                }
                            } else if (typeof staticValue.errorPage === 'string') {
                                errors.push(staticValue.errorPage);
                            }
                            for (const error of errors) {
                                if (error.match(/[0-9]{3} /)) {
                                    staticLocation._add('error_page', error);
                                } else {
                                    staticLocation._add('error_page', `404 /${error}`);
                                }
                            }
                        }
                        if (staticValue.notFoundErrorPage) {
                            staticLocation._add('error_page', `404 ${staticValue.notFoundErrorPage}`);
                        }
                        if (staticValue.gatewayErrorPage) {
                            staticLocation._add('error_page', `502 504 ${staticValue.gatewayErrorPage}`);
                        }
                        if (backendExists) {
                            staticLocation._add(`try_files $uri${staticValue.indexPage ? ` $uri/${staticValue.indexPage}` : ''} ${staticValue.fail === 'fast' ? '=404' : backendLocationKey}`);
                        }
                    }
                    if (backendExists && !source.static['/']) {
                        const staticLocation = addLocation(nserver, 'location /');
                        staticLocation._add('proxy_pass', proxyPassUrl);
                    }
                }

                if (counter === 0) {
                    if (isDefault) {
                        nserver._add('return 444');
                    }
                    return;
                }

                const nlocation = addLocation(nserver, `location ${backendLocationKey}`);

                if (rewrites.size > 0) {
                    for (const item of rewrites) {
                        nlocation._add(item);
                    }
                    if (rewriteFinal) {
                        return;
                    }
                }
                nlocation._add('proxy_pass', proxyPassUrl);

                if (hosts.size === 0) {
                    if (isDefault) {
                        nserver._add('return 444');
                    }
                    return;
                }

                if (internal) {
                    return;
                }

                let upstream = conf.nginx[`upstream ${key}_${protocol}`];
                if (!upstream) {
                    conf.nginx._add(`upstream ${key}_${protocol}`);
                    upstream = conf.nginx[`upstream ${key}_${protocol}`];
                }
                if (upstream.length > 0) {
                    upstream = upstream.at(-1);
                }
                for (const item of hosts) {
                    if (!upstream[item]) {
                        upstream._add(item);
                    }
                }


                if (hostsExternal.size > 0) {
                    let nserver = conf.nginx._add('server').server;
                    if (nserver.length > 0) {
                        nserver = nserver.at(-1);
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
                        if (nlocation.length > 0) {
                            nlocation = nlocation.at(-1);
                        }
                    }

                    nlocation._add('proxy_pass', `https://${key}_${protocol}_backup`);

                    let upstream = conf.nginx[`upstream ${key}_${protocol}_backup`];
                    if (!upstream) {
                        conf.nginx._add(`upstream ${key}_${protocol}_backup`);
                        upstream = conf.nginx[`upstream ${key}_${protocol}_backup`];
                    }
                    if (upstream.length > 0) {
                        upstream = upstream.at(-1);
                    }

                    for (const item of hostsExternal) {
                        if (!upstream[item]) {
                            upstream._add(item);
                        }
                    }
                }
            }

            makeHost({
                port: 80,
                noWildcard: !redirectFromHttp && source.static !== undefined,
            });
            if (source.ssl !== false) {
                makeHost({
                    port: 443,
                    secure: true,
                    noWildcard: source.static !== undefined,
                });
            }
            if (source.static !== undefined) {
                if (!redirectFromHttp) {
                    makeHost({
                        port: 80,
                        internal: true,
                        onlyWildcard: true,
                    });
                }
                if (source.ssl !== false) {
                    makeHost({
                        port: 443,
                        secure: true,
                        internal: true,
                        onlyWildcard: true,
                    });
                }
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
        const siteEnabledPath = path.normalize(`${nginxPath}/sites-enabled`);
        const mapsPath = path.normalize(`${nginxPath}/maps`);
        await Promise.all([
            mkdirSafe(siteEnabledPath),
            mkdirSafe(mapsPath),
        ]);

        const jobs = {};

        const sslOn = config.routing.ssl && config.routing.ssl.defaultPreset && config.routing.ssl.presets && !argv.fastBuild;
        if (sslOn) {
            const certPath = path.normalize(`${nginxPath}/cert`);
            const acmePath = `${argv.home}/acme`;
            const accountsPath = `${acmePath}/accounts`;
            await Promise.all([
                mkdirSafe(certPath),
                mkdirSafe(acmePath),
                mkdirSafe(accountsPath),
            ]);

            Object.assign(jobs, {
                'generate root certificates': async () => {
                    try {
                        await openssl.generateRoot(certPath);
                        const expiryData = await openssl.checkRoot();
                        const expiredList = [];
                        let first;
                        for (const item of expiryData) {
                            if (item.expired) {
                                expiredList.push(item);
                            }
                            if (first === undefined || first > item.expireDate) {
                                first = item.expireDate;
                            }
                            o.modules.notificator.add({
                                date: item.expireDate,
                                key: `regenerate-root-for:${item.key}`,
                                message: `Root certificate for "${item.key}" will expire on ${item.expiry.toISOString()}!`,
                            });
                        }
                        if (expiredList.length > 0) {
                            o.modules.importantMessages.add(`Root certificates expiration dates:\n    ${expiredList.map((x) => '• ' + x.expiry.toISOString() + ' ' + x.key).join('\n    ')}`);
                        }
                    } catch (e) {
                        console.error(e);
                        throw e;
                    }
                    debug('generate root certificates: done');
                },
                'openssl check certificates': async () => {
                    const certificatesFiles = await findFile(certPath, /^host-.*\.crt$/);
                    const certificatesChecked = await Promise.all(certificatesFiles.map((x) => certificateExpirationFile(x)));
                    const certificatesUnlink = [];
                    for (const item of certificatesChecked) {
                        const { file, expired, remainingDays } = item;
                        if (expired) {
                            certificatesUnlink.push(Promise.all([
                                fs.unlink(file),
                                fs.unlink(file.replace(/\.crt$/, '.key')),
                            ]).then(() => {
                                return debug(`certificate cleanup: ${file}: expiry: valid for: ${remainingDays | 0} days, unlinked`);
                            }));
                        } else {
                            debug(`certificate cleanup: ${file}: expiry: valid for: ${remainingDays | 0} days`);
                        }
                    }
                    await Promise.all(certificatesUnlink);
                    debug('openssl check certificates: done');
                },
                'openssl generate certificates': ['generate root certificates', 'openssl check certificates', async () => {
                    const tasks = [];
                    const accountPathCheck = {};
                    for (const [routeKey, route] of Object.entries(config.parser.targets.map)) {
                        const preset = openssl.getPreset(route);
                        if (preset && preset.acmeAny) {
                            const accountPath = `${accountsPath}/${preset.key}`;
                            const exportPath = `${accountPath}/export`;
                            if (!accountPathCheck[accountPath]) {
                                accountPathCheck[accountPath] = mkdirSafe(exportPath);
                            }
                            tasks.push(
                                openssl.generate.bind(openssl, {
                                    certPath: exportPath,
                                    rootPath: certPath,
                                    appendHash: false,
                                    allowSelfSigned: true,
                                }, routeKey),
                                async () => {
                                    try {
                                        await Promise.allSettled([
                                            fs.unlink(`${certPath}/host-${routeKey}.key`),
                                            fs.unlink(`${certPath}/host-${routeKey}.crt`),
                                        ]);
                                    } finally {
                                        const p = `${argv.replaceHome || argv.home}/acme/accounts/${preset.key}/export`;
                                        await Promise.all([
                                            fs.symlink(`${p}/host-${routeKey}.key`, `${certPath}/host-${routeKey}.key`),
                                            fs.symlink(`${p}/host-${routeKey}.crt`, `${certPath}/host-${routeKey}.crt`),
                                        ]);
                                    }
                                },
                            );
                        } else {
                            tasks.push(openssl.generate.bind(openssl, {
                                certPath,
                            }, routeKey));
                        }
                    }
                    try {
                        await Promise.all(Object.values(accountPathCheck));
                        const results = await async.parallel(tasks);

                        const expireBefore = 30;
                        const expiryArr = [];
                        for (const item of results) {
                            if (typeof item !== 'object') {
                                continue;
                            }
                            if (item.acme) {
                                continue;
                            }
                            expiryArr.push(item);
                            item.expiry = new Date(Date.now() + (1000 * 60 * 60 * 24 * (item.expirationDays)));
                            item.expireDate = new Date(Date.now() + (1000 * 60 * 60 * 24 * (item.expirationDays - expireBefore)));
                        }
                        for (const item of expiryArr) {
                            o.modules.notificator.add({
                                date: item.expireDate,
                                key: `regenerate-configuration-for:${item.key}`,
                                message: `Certificate for "${item.key}" will expire on ${item.expiry.toISOString()}, regenerate your configuration!`,
                            });
                        }
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
                    await generateFile(target, routePath, {
                        ...o,
                        mapsPath,
                        debug,
                    });
                    debug(`config: ${target.key}: done`);
                });
                debug('configs: done');
            },
            'generate xff-map main config': async () => {
                const mapPath = path.normalize(`${mapsPath}/beaver_xff_map.conf`);
                await generateXFFMapConfig({
                    config,
                    mapPath,
                    defaultVarName: 'remote_addr',
                    mainVarName: 'beaver_xff_map',
                    trust: [
                        '@routers',
                        o.config.parser?.routing?.options?.nginx?.trust,
                    ],
                });
                debug('xff-map main config: done');
            },
        });

        await async.auto(jobs);
        debug('done');
    },
};

async function generateXFFMapConfig(o) {
    const r = [
        [['default', `$${o.defaultVarName};`, '# if nothing found']],
        parseAcls(
            o.config.parser,
            new Set(o.trust.flat().filter(Boolean)),
            undefined,
            false,
        ).map((x) => {
            return [x.value, '$proxy_add_x_forwarded_for;', `# ${x.comment}`];
        }),
    ].flat();
    const map = file`
        map $remote_addr $${o.mainVarName} {
            ${columnize(r).join('\n            ')}
        }
    `;
    await fs.writeFile(o.mapPath, map);
}
