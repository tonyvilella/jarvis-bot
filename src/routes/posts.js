// src/routes/posts.js
'use strict';

const express = require('express');
const router  = express.Router();

const log = require('../utils/log');
const { createImagePost, publishPost } = require('../services/instagram');

// cache-buster pra mesma URL não “prender” no IG
function bust(u) {
  const url = String(u || '').trim();
  if (!url) return url;
  if (/\bts=\d+/.test(url)) return url;
  return url.includes('?') ? `${url}&ts=${Date.now()}` : `${url}?ts=${Date.now()}`;
}

// health
router.get('/ping', (_req, res) => {
  log.info('GET /posts/ping');
  res.json({ ok: true, now: new Date().toISOString() });
});

// cria + publica imagem
router.post('/create', async (req, res) => {
  const body = req.body || {};
  const caption   = typeof body.caption   === 'string' ? body.caption   : '';
  const image_url = typeof body.image_url === 'string' ? body.image_url : '';

  log.info('POST /posts/create');
  log.debug('payload: caption="%s" image_url=%s', caption, image_url);

  if (!image_url) {
    log.warn('missing image_url');
    return res.status(400).json({ ok: false, error: 'missing_image_url' });
  }

  try {
    // 1) cria container
    const creationId = await createImagePost(bust(image_url), caption);
    log.info('container=%s', creationId);

    // 2) publica (espera FINISHED por dentro)
    const mediaId = await publishPost(creationId);
    log.info('published=%s', mediaId);

    return res.json({ ok: true, media_id: mediaId, creation_id: creationId });
  } catch (err) {
    log.error('create post failed', err);
    const status = err?.response?.status;
    return res.status(status && status >= 400 && status < 600 ? status : 500).json({
      ok: false,
      error: 'publish_failed',
      details: err?.response?.data || err?.details || { message: err.message },
    });
  }
});

module.exports = router;
