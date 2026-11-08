import argv from './argv.js';
import fs from 'node:fs';

import path from 'node:path';

import * as jose from 'jose';

const alg = 'HS512';
const maxAge = 1000 * 60 * 1;
const bobotAuthPath = path.normalize(`${argv.home}/bobot.auth`);

const getBobotAuth = (() => {
    let buf;
    async function readFile() {
        if (buf === undefined) {
            try {
                buf = await fs.promises.readFile(bobotAuthPath);
            } catch {
                buf = false;
            }
        }
        return buf;
    }
    return async () => {
        const data = await readFile();
        return Buffer.isBuffer(data) ? data.toString().trim() : false;
    };
})();

const M = {
    bobotAuthPath,
    getBobotAuth,
    getBobotJWT() {
        return M.signJWT({
            u: 'bobot',
        });
    },
    async getBobotJWTCookie() {
        return `jwt=${await M.getBobotJWT() ?? ''}`;
    },
    async signJWT(payload) {
        const auth = await getBobotAuth();
        if (!auth) {
            return;
        }
        const secret = new TextEncoder().encode(auth);
        return await new jose.SignJWT(payload)
            .setProtectedHeader({
                alg,
            })
            .setIssuedAt()
            .setExpirationTime(new Date(Date.now() + maxAge))
            .sign(secret);
    },
    async verifyJWT(jwt) {
        const auth = await getBobotAuth();
        if (!auth) {
            return;
        }
        const secret = new TextEncoder().encode(auth);
        const { payload } = await jose.jwtVerify(jwt, secret);
        if ((payload.exp - payload.iat) * 1000 !== maxAge) {
            throw new Error('bad maxAge');
        }
        return payload;
    },
    setJWTCookie(res, jwt) {
        const options = {
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
        };
        if (jwt) {
            options.maxAge = maxAge;
            res.cookie('jwt', jwt, options);
        } else {
            res.clearCookie('jwt', options);
        }
    },
};

export default M;
export { bobotAuthPath };
export const getBobotJWTCookie = M.getBobotJWTCookie;
export const setJWTCookie = M.setJWTCookie;
export const signJWT = M.signJWT;
export const verifyJWT = M.verifyJWT;
export { getBobotAuth };
export const getBotobJWT = M.getBotobJWT;
export const getBotobJWTCookie = M.getBotobJWTCookie;
