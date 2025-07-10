const express = require('express');
const router  = express.Router();

router.get('/ping', (_req, res) => res.json({ status: 'ads ok' }));

module.exports = router;
