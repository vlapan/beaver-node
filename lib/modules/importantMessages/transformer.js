const AbstractTransformer = require('../AbstractTransformer');

class ImportantMessages extends AbstractTransformer {
    static systemic = true;

    constructor(o) {
        super(o);
        this.list = [];
    }

    add(v) {
        this.list.push(v);
    }

    toMessage() {
        let message = '';
        if (this.list.length > 0) {
            message += `Important messages:\n  ${this.list.join('\n  ')}\n`;
        }
        return message;
    }
}

module.exports = ImportantMessages;
