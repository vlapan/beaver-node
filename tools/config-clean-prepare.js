const fs = require('node:fs');

const type = process.argv.pop();
const file = process.argv.pop();

(async () => {
    const promises = [];
    promises.push(
        fs.promises.readFile(file, 'utf8'),
        fs.promises.readFile(`./ssl/${type}.rootCA.crt`, 'utf8'),
        fs.promises.readFile(`./ssl/${type}.rootCrt.crt`, 'utf8'),
        fs.promises.readFile(`./ssl/${type}.rootKey.key`, 'utf8'),
    );
    const [
        json,
        rootCA,
        rootCrt,
        rootKey,
    ] = await Promise.all(promises);
    const data = JSON.parse(json);


    for (const preset of Object.values(data.routing.ssl.presets)) {
        if (preset.rootCA) {
            preset.rootCA = rootCA;
        }
        if (preset.rootKey) {
            preset.rootKey = rootKey;
        }
        if (preset.rootCrt) {
            preset.rootCrt = rootCrt;
        }
    }

    await fs.promises.writeFile(file, JSON.stringify(data, null, 4));
})();
