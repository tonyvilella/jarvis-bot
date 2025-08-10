// src/routes/posts.js
'use strict';

const express = require('express');
const { createImagePost, publishPost } = require('../services/instagram');

const router = express.Router();

// helper: cache‑buster pra mesma URL não ficar “presa” no IG
function bust(url) {
  const u = String(url || '').trim();
  if (!u) return u;
  if (/\bts=\d+/.test(u)) return u; // já tem ts
  return u.includes('?') ? `${u}&ts=${Date.now()}` : `${u}?ts=${Date.now()}`;
}

// health check
router.get('/ping', (_req, res) => {
  res.json({ status: 'posts ok' });
});

// cria + publica uma imagem
router.post('/create', async (req, res) => {
  const body = req.body || {};
  const caption = typeof body.caption === 'string' ? body.caption : '';
  const image_url = typeof body.image_url === 'string' ? body.image_url : '';

  if (!image_url) {
    return res.status(400).json({ ok: false, error: 'image_url é obrigatório' });
  }

  try {
    // 1) cria o container (ORDEM CERTA: image_url, caption) + bust pra evitar cache
    const creationId = await createImagePost(bust(image_url), caption);

    // 2) publica (publishPost já retorna apenas o ID)
    const mediaId = await publishPost(creationId);

    return res.json({ ok: true, media_id: mediaId, creation_id: creationId });
  } catch (err) {
    // erro detalhado pra diagnosticar rápido no Postman/Cloud Run logs
    const details = err?.response?.data || err?.details || { message: err.message };
    console.error('IG publish error:', details);
    return res.status(500).json({ ok: false, error: 'Erro ao publicar', details });
  }
});

module.exports = router;
