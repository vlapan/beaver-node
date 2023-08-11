const { toKebabCase } = require('../utils/index.js');

class AbstractBase {
    constructor(o) {
        this.o = o;
        this.nameClean = this.constructor.name.replace(new RegExp(`${this.o.key}$`), '');
        this.name = toKebabCase(this.nameClean);
        this.debug = o.debug.extend(this.name);
    }

}

module.exports = AbstractBase;