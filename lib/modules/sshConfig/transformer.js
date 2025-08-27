const fs = require('node:fs');
const AbstractTransformer = require('../AbstractTransformer');

class SshConfig extends AbstractTransformer {
    constructor(o) {
        super(o);
        this.file = `${o.config._outputPath}/ssh_config`;
    }

    static getHost(options) {
        const result = [];
        result.push(
            `Host ${options.key}`,
            `    AddressFamily ${options.ipv6 ? 'inet6' : 'inet'}`,
            `    Port ${options.port}`,
        );
        return result.join('\n');
    }

    async transform() {
        this.debug('start');

        const result = [
            '# Copy and include this file in your ~/.ssh/config',
            '# Include ~/.ssh/beaver/*',
            '#',
            '',
        ];

        for (const [key, server] of Object.entries(this.o.config.parser.servers.map)) {
            const level3 = (server.routingType || {}).level3 ?? {};
            const level3Ssh = Object.entries(level3).find(([k]) => k.startsWith('22/tcp') || k === '22');

            if (server.wan3) {
                const port = level3Ssh && Number.parseInt(level3Ssh[1], 10) || 22;
                result.push(SshConfig.getHost({
                    key,
                    port,
                }));
            } else if (server.location && server.lan3) {
                const port = (Number(server.tcpShift || 0) + 22);
                result.push(SshConfig.getHost({
                    key,
                    port,
                }));
            } else if (server.wan36) {
                const port = level3Ssh && Number.parseInt(level3Ssh[1], 10) || 22;
                result.push(SshConfig.getHost({
                    ipv6: true,
                    key,
                    port,
                }));
            }
        }

        await fs.promises.writeFile(this.file, result.join('\n'));
        this.debug(`${this.file}: done`);
    }
}

module.exports = SshConfig;
