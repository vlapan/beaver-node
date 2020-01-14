const express = require('express');
const debug = require('debug')('beaver:api:git-static');

const argv = require('../argv');
const git = require('./index');

const router = express.Router();

router.all('/:repository', async (req, res) => {
    const { repository } = req.params;
    debug(`repository: ${repository}`);
    const updates = await git.pullClone.call({
        log: (data) => {
            debug(data);
        }
    }, repository, `${argv.home}/git-static`);
    res.end(updates ? 'UPDATED' : 'NO UPDATES');
});

module.exports = router;
