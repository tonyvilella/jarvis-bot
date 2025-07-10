// src/routes/schedule.js
const express = require('express');
const { schedulePost } = require('../services/scheduler');
const router = express.Router();

router.post('/schedule', async (req, res) => {
  try {
    const { caption, image_url, datetime } = req.body;
    const jobId = await schedulePost({ caption, image_url, datetime });
    res.json({ ok: true, jobId });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

module.exports = router;
