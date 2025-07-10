// src/routes/instagram.js
const express = require('express');
const { getProfile } = require('../services/instagram');

const router = express.Router();

router.get('/ping', async (_req, res) => {
  try {
    const profile = await getProfile();
    res.json({ ok: true, profile });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ ok: false, error: 'Instagram API error' });
  }
});

module.exports = router;
