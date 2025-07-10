// src/routes/posts.js
const express = require('express');
const { createImagePost, publishPost } = require('../services/instagram');

const router = express.Router();

router.get('/ping', (_req, res) => res.json({ status: 'posts ok' }));

router.post('/create', async (req, res) => {
  const { caption, image_url } = req.body;
  if (!image_url) {
    return res.status(400).json({ ok: false, error: 'image_url é obrigatório' });
  }

  try {
    const creationId = await createImagePost(caption, image_url);
    const result     = await publishPost(creationId);
    res.json({ ok: true, media_id: result.id });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ ok: false, error: 'Erro ao publicar' });
  }
});

module.exports = router;
