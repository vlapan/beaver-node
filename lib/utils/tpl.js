module.exports = {
    file(strings, ...keys) {  
        const result = [];
        let flsp = 0;
        for (let i = 0, till = strings.length; i < till; i++) {
            const string = strings[i];
            const value = keys[i];
            if (i === 0) {
                [,flsp] = string.match(/^\n(\s+)/);
            }
            result.push(string);
            result.push(value);
        }
        return result.join('').replace(/^\n/, '').replace(new RegExp(`^${flsp}`, 'gm'), '');
    }
};