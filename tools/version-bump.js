const fs = require('fs/promises');
// eslint-disable-next-line node/no-unpublished-require, import/no-extraneous-dependencies
const inc = require('semver/functions/inc');

(async function () {
    try {
        const path = './package.json';
        const json = await fs.readFile(path);
        const data = JSON.parse(json);
        data.version = inc(data.version, 'patch');
        console.log(data.version);
        await fs.writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
    } catch (error) {
        console.error(error);
        throw error;
    }
})();
