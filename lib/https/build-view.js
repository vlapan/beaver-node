const puglatizer = require('puglatizer');

puglatizer(`${__dirname}/views/dynamic`, `${__dirname}/public/js/view-compiled.js`, {
    compileDebug: false,
    cache: false,
    debug: false,
});
