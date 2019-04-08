const puglatizer = require('puglatizer');

puglatizer(`./lib/https/views/dynamic`, `./lib/https/public/js/view-compiled.js`, {
    compileDebug: false,
    cache: false,
    debug: false,
});
