

const fs = require('fs');
const path = require('path');

const async = require('async');
const NginxConfFile = require('nginx-conf').NginxConfFile;

const openssl = require(`${__dirname}/../../openssl`);
const config = require(`${__dirname}/../../configuration`);
const logger = require(`${__dirname}/../../logger`);

function generateFile(route, routePath, callback) {
    const failTimeout = '15s';
    const routeKey = route.key;
    const isDefault = routeKey === 'default';
    fs.openSync(routePath, 'w');
    NginxConfFile.create(routePath, (err, conf) => {
        logger.log('debug', `"${routeKey}" route...`);

        if (err) {
            logger.log('warn', err);
            return;
        }

        conf.on('flushed', () => {
            if (typeof callback === 'function') {
                callback(null);
            }
        });
        conf.die(routePath);

        function makeHost(port, secure) {
            let nserver = conf.nginx._add('server').server;
            if (nserver.length) {
                nserver = nserver[nserver.length - 1];
            }

            nserver._add('listen', port + (isDefault ? ' default_server' : ''));
            nserver._add('server_name', isDefault ? '_' : `${routeKey} *.${routeKey}`);

            if (typeof route.source.nginx === 'object') {
                for (const settingKey of Object.keys(route.source.nginx)) {
                    nserver._add(settingKey, route.source.nginx[settingKey]);
                }
            }

            if (secure) {
                nserver._add('ssl', 'on');
                nserver._add('ssl_certificate', `cert/host-${routeKey}.crt`);
                nserver._add('ssl_certificate_key', `cert/host-${routeKey}.key`);
            }

            if (isDefault) {
                nserver._add('return 444');
                return;
            }

            if (route.source.root) {
                nserver._add('root', route.source.root);
            }

            // const target = config._routes[routeKey];
            const target = route.endpointsList;

            let protocol = secure ? 'https' : 'http';
            const key = routeKey.replace(/\./gi, '_');

            const hosts = [];
            const hostsExternal = [];

            let external = false;
            let counter = 0;
            let maxFails = 5;

            let flag = false;
            for (const item of target) {
                if (item.TargetStatic) {
                    const url = item[secure ? 'proxyHttps' : 'proxyHttp'];
                    if (url) {
                        flag = true;
                        protocol = url.substring(0, url.indexOf('://'));
                        const uri = url.substring(url.indexOf('://') + 3);
                        hosts.push(`server ${uri} weight=3 max_fails=${maxFails} fail_timeout=${failTimeout}`);
                        counter += 1;
                    }
                } else {
                    if (!item.location || item.location === config.parser.location) {
                        const targetPort = config.routing.types[item.source.type || 'unix'].level6[secure ? 'secure' : 'plain'];
                        hosts.push(`server ${item.lan3 || item.wan3}:${targetPort} weight=3 max_fails=${maxFails} fail_timeout=${failTimeout}`);
                        counter += 1;
                    } else {
                        const backup = route.hasLocalEndpoints && !secure ? ' backup' : '';
                        maxFails = backup ? 3 : 5;
                        if (route.hasLocalEndpoints && secure && !external) {
                            hosts.push(`server 127.0.0.1:81 weight=3 max_fails=3 fail_timeout=${failTimeout} backup`);
                        }

                        const list = route.hasLocalEndpoints && secure ? hostsExternal : hosts;
                        if (route.hasLocalEndpoints && secure && item.wan3) {
                            list.push(`server ${item.wan3}:443 weight=3 max_fails=${maxFails} fail_timeout=${failTimeout}`);
                        } else {
                            const location = item.location;
                            const wan3 = (location && location.wan3) || item.wan3;
                            if (wan3) {
                                for (const ip of [].concat(wan3)) {
                                    list.push(`server ${ip}:${secure ? 443 : 80} weight=3 max_fails=${maxFails} fail_timeout=${failTimeout}${backup}`);
                                }
                            }
                        }
                        external = true;
                        counter += 1;
                    }
                }
            }

            if (counter === 0) {
                return;
            }

            let nlocation = nserver['location /'];
            if (!nlocation) {
                nserver._add('location /');
                nlocation = nserver['location /'];
                if (nlocation.length) {
                    nlocation = nlocation[nlocation.length - 1];
                }
            }

            nlocation._add('proxy_pass', `${flag ? protocol : (route.hasLocalEndpoints || !secure ? 'http' : 'https')}://${key}_${protocol}`);

            if (!hosts.length) {
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

            if (hostsExternal.length) {
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
        makeHost(443, true);

        conf.live(routePath);
        conf.flush();
    });
}

module.exports = {
    generate(callback) {
        logger.log('info', '======================================================================');
        logger.log('info', 'Nginx configutation generation');
        logger.log('info', '----------------------------------------------------------------------');

        const nginxPath = path.normalize(`${config._outputPath}/nginx`);
        if (!fs.existsSync(nginxPath)) {
            fs.mkdirSync(nginxPath);
        }

        const siteEnabledPath = path.normalize(`${nginxPath}/sites-enabled`);
        if (!fs.existsSync(siteEnabledPath)) {
            fs.mkdirSync(siteEnabledPath);
        }

        const jobs = {};

        const sslOn = config.routing.ssl && config.routing.ssl.defaultPreset && config.routing.ssl.presets;
        if (sslOn) {
            const certPath = path.normalize(`${nginxPath}/cert`);
            if (!fs.existsSync(certPath)) {
                fs.mkdirSync(certPath);
            }
            jobs.openssl = (callback) => {
                openssl.generateRoot(certPath, (err) => {
                    if (err) {
                        callback(err);
                        return;
                    }

                    const tasks = [];
                    for (const routeKey of Object.keys(config.parser.targets.map)) {
                        tasks.push(openssl.generate.bind(null, certPath, routeKey));
                    }
                    async.parallelLimit(tasks, 4, (err, result) => {
                        logger.log('debug', 'nginx cert done...');
                        callback(err, true);
                    });
                });
            };
        }

        jobs.conf = (callback) => {
            const total = config.parser.targets.list.length;
            let generatedCount = 0;
            for (const target of config.parser.targets.list) {
                const routePath = path.normalize(`${siteEnabledPath}/${target.key}.conf`);
                generateFile(target, routePath, (err) => {
                    generatedCount += 1;
                    logger.log('info', `"${target.key}" finished, waiting for other ${total - generatedCount}`);
                    if (total - generatedCount === 0) {
                        callback(null, true);
                    }
                });
            }
        };

        async.parallel(jobs, (err, result) => {
            if (err) {
                logger.log('error', `nginx errors: ${err}`);
            } else {
                logger.log('info', 'nginx done!');
            }
            if (typeof callback === 'function') {
                callback(err, true);
            }
        });
    },
};
