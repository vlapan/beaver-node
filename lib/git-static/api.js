import argv from '../argv.js';
import git from './index.js';

import express from 'express';
import createDebug from 'debug';
const debug = createDebug('beaver:api:git-static');

const router = express.Router();

router.all('/:repository', async (req, res) => {
    const { repository } = req.params;
    debug(`repository: ${repository}`);
    const updates = await git.pullClone.call({
        log: (data) => {
            debug(data);
        },
    }, repository, `${argv.home}/git-static`);
    const reply = updates === undefined ? 'ERROR' : (updates ? 'UPDATED' : 'NO UPDATES');
    res.end(reply);
});
export { router };

export default router;
