const fs = require('node:fs');
const { spawn } = require('node:child_process');

const express = require('express');
const basicAuth = require('basic-auth');

const layoutTemplate = require('../views/layout');
const { signJWT, verifyJWT, setJWTCookie } = require('../../bobot');

function askAuthentication(res) {
    const ask = () => {
        setJWTCookie(res, '');
        res.set('WWW-Authenticate', 'Basic realm="Authorization Required", charset="UTF-8"');
        res.status(401).end();
    };
    if (res.locals.badAuthenticationDelay === true) {
        setTimeout(ask, 1000);
    } else {
        ask();
    }
}

function setAuthenticated(res, user, method) {
    res.locals.authenticated = true;
    res.locals.username = user;
    res.locals.authenticationMethod = method;
}

function checkAuthentication(req, res, next) {
    if (res.locals.authenticated) {
        next();
    } else {
        askAuthentication(res);
    }
}

function checkBasicAuthData(req, res, next) {
    const basicData = basicAuth(req);

    // username limit: https://github.com/freebsd/freebsd-src/blob/main/sys/sys/param.h#L128
    // password limit: https://github.com/freebsd/freebsd-src/blob/main/include/pwd.h#L112
    if (typeof basicData === 'object' && basicData.name && basicData.name !== 'root' && basicData.name.length <= 32 && basicData.pass && basicData.pass.length <= 128) {
        res.locals.basicData = basicData;
    }

    next();
}

module.exports = {
    generator: async (o) => {
        const debugAuth = o.debug.extend('auth');
        const argv = o.argv;
        const config = o.config;

        const router = express.Router();

        const passwdAuth = (unixcrypt, req, res, next) => {
            const basicData = res.locals.basicData;
            if (!basicData || res.locals.authenticated) {
                next();
                return;
            }
            fs.readFile(`${argv.home}/passwd`, 'utf8', (err, data) => {
                if (err) {
                    debugAuth(`passwd: read file error: '${err}'!`);
                    next();
                } else {
                    const arr = data.split('\n');
                    for (const item of arr) {
                        if (item.startsWith(`${basicData.name}:`)) {
                            const passHash = item.split(':').pop();
                            try {
                                if (unixcrypt.verify(basicData.pass, passHash)) {
                                    setAuthenticated(res, basicData.name, 'passwd');
                                } else {
                                    debugAuth(`passwd: auth error: user(${basicData.name}) found but given pass is invalid!`);
                                    res.locals.badAuthenticationDelay = true;
                                }
                            } catch (e) {
                                debugAuth(`passwd: hash error: ${e}`);
                            }
                            next();
                            return;
                        }
                    }
                    debugAuth(`passwd: auth error: user(${basicData.name}) is not found!`);
                    res.locals.badAuthenticationDelay = true;
                    next();
                }
            });
        };

        const pamAuth = (pam, req, res, next) => {
            const basicData = res.locals.basicData;
            if (!basicData || res.locals.authenticated) {
                next();
                return;
            }
            pam.authenticate(basicData.name, basicData.pass, (err) => {
                if (err) {
                    debugAuth(`pam: auth error: '${err}'!`);
                    res.locals.badAuthenticationDelay = true;
                } else {
                    setAuthenticated(res, basicData.name, 'pam');
                }
                next();
            });
        };

        const pamHelperAuth = async (pamHelperPath, req, res, next) => {
            const basicData = res.locals.basicData;
            if (!basicData || res.locals.authenticated) {
                next();
                return;
            }
            const pamHelperResult = await new Promise((resolve) => {
                let msg = '';
                const child = spawn(pamHelperPath, ['system', basicData.name], {
                    stdio: 'pipe',
                    timeout: 3000,
                });
                child.stdout.on('data', (data) => {
                    msg += data;
                });
                child.stderr.on('data', (data) => {
                    msg += data;
                });
                child.on('error', (e) => {
                    resolve({
                        msg: e,
                        result: false,
                    });
                });
                child.on('exit', (code) => {
                    if (code === 0) {
                        resolve({
                            result: true,
                        });
                    } else {
                        resolve({
                            msg: msg.trim(),
                            result: false,
                        });
                    }
                });
                child.stdin.write(basicData.pass);
                child.stdin.end();
            });
            if (pamHelperResult.result === true) {
                setAuthenticated(res, basicData.name, 'pam_helper');
            } else {
                debugAuth(`pam_helper: auth error: '${pamHelperResult.msg}'!`);
                res.locals.badAuthenticationDelay = true;
            }
            next();
        };

        const jwtAuth = async (req, res, next) => {
            const jwt = req.cookies.jwt;
            if (!jwt || res.locals.authenticated) {
                next();
                return;
            }
            try {
                const payload = await verifyJWT(jwt);
                if (payload === undefined) {
                    next();
                    return;
                }
                if (typeof payload.u !== 'string') {
                    throw new TypeError('bad token payload');
                }
                setAuthenticated(res, payload.u, 'jwt');
            } catch (e) {
                if (e.code !== 'ERR_JWT_EXPIRED') {
                    debugAuth(`jwt: auth error: '${e}'!`);
                }
                res.locals.badAuthenticationDelay = true;
            }
            next();
        };

        const authenticationMethods = {
            passwd: async () => {
                try {
                    const unixcrypt = await import('unixcrypt');
                    router.use(passwdAuth.bind(undefined, unixcrypt));
                } catch (e) {
                    return e;
                }
            },
            pam: () => {
                try {
                    const pam = require('authenticate-pam');
                    router.use(pamAuth.bind(undefined, pam));
                } catch (e) {
                    return e;
                }
            },
            pam_helper: async () => {
                try {
                    const pamHelperPath = await new Promise((resolve) => {
                        let result = '';
                        const child = spawn('which', ['pam_helper'], {
                            stdio: [
                                undefined,
                                'pipe',
                                'pipe',
                            ],
                            timeout: 1000,
                        });
                        child.stdout.on('data', (data) => {
                            result += data;
                        });
                        child.on('error', () => {
                            resolve(false);
                        });
                        child.on('exit', (code) => {
                            if (code === 0) {
                                resolve(result.trim());
                            } else {
                                resolve(false);
                            }
                        });
                    });
                    if (pamHelperPath === false) {
                        throw new Error('pam_helper not found');
                    }
                    router.use(pamHelperAuth.bind(undefined, pamHelperPath));
                } catch (e) {
                    return e;
                }
            },
            jwt: () => {
                try {
                    router.use(jwtAuth);
                } catch (e) {
                    return e;
                }
            },
        };

        router.get('/logout.force', (req, res) => {
            askAuthentication(res);
        });

        router.use(checkBasicAuthData);

        debugAuth(`available authentication methods: ${Object.keys(authenticationMethods).join(', ')}`);
        debugAuth(`will attempt to enable the requested authentication methods: ${argv.authenticationMethods.join(', ')}`);
        const authenticationMethodsEnabled = [];
        for (const key of argv.authenticationMethods) {
            const method = authenticationMethods[key];
            if (typeof method === 'function') {
                const result = await method();
                if (result instanceof Error) {
                    debugAuth(`${key}: load error: method failed to enable: "${result.message.split('\n').shift()}"!`);
                } else {
                    authenticationMethodsEnabled.push(key);
                    debugAuth(`${key}: method was enabled successfully!`);
                }
            } else {
                debugAuth(`${key}: load error: method not found!`);
            }
        }
        debugAuth(`enabled authentication methods: ${authenticationMethodsEnabled.join(', ')}`);

        router.get('/logout', (req, res) => {
            // res.set('Clear-Site-Data', '"*"');
            setJWTCookie(res, '');
            if (res.locals.authenticated) {
                res.status(200).end(layoutTemplate.layoutLogout({
                    hostname: config._hostname,
                }));
                debugAuth(`"${res.locals.username}" logout`);
            } else {
                res.set('Location', '/')
                res.status(302).end();
            }
        });

        router.use(checkAuthentication);

        return router;
    },
    setAuthCookie: (o) => {
        const argv = o.argv;

        const router = express.Router();

        if (argv.authenticationMethods.includes('jwt')) {
            router.use(async (req, res, next) => {
                const jwt = await signJWT({
                    u: res.locals.username,
                });
                if (jwt === undefined) {
                    setJWTCookie(res, '');
                    next();
                    return;
                }
                setJWTCookie(res, jwt);
                next();
            });
        }
        return router;
    },
};
