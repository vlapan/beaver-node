const os = require('node:os');

const debug = require('debug')('beaver:nodemailer');

const nodemailer = require('nodemailer');

const { sleep } = require('./index');

const M = {
    transporter: undefined,
    getTransporter: () => {
        return M.transporter || M.createTransporter();
    },
    createTransporter: () => {
        M.transporter = nodemailer.createTransport({
            host: '127.0.0.1',
            port: 25,
            pool: true, // set to true to use pooled connections (defaults to false) instead of creating a new connection for every email
            maxConnections: 5, // is the count of maximum simultaneous connections to make against the SMTP server (defaults to 5)
            maxMessages: 100, // limits the message count to be sent using a single connection (defaults to 100). After maxMessages is reached the connection is dropped and a new one is created for the following messages
            logger: true,
        });
        return M.transporter;
    },
};

module.exports = async (to, subject, text, html) => {
    const transporter = M.getTransporter();
    const from = `${process.env.USER || 'root'}@${os.hostname()}`;
    const options = {
        from,
        to,
        subject,
        text,
        html,
    };
    debug(`Sending mail... ${JSON.stringify(options, null, 4)}`);
    let info;
    for (let i = 0; i < 3; i++) {
        try {
            info = await transporter.sendMail(options);
            debug(info);
            break;
        } catch (e) {
            debug(e);
            await sleep((i + 1) * 7000);
        }
    }
    return info;
};
