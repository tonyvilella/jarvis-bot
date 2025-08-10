// src/routes/posts.js
const express = require('express');
const { createImagePost, publishPost } = require('../services/instagram');

const router = express.Router();

/**
 * Health‑check para o módulo de posts
 * GET /posts/ping → { status: 'posts ok' }
 */
router.get('/ping', (_req, res) => {
  res.json({ status: 'posts ok' });
});

// cache-buster simples pra evitar cache do Instagram na mesma URL
function bust(url) {
  const u = String(url || '').trim();
  if (!u) return u;
  return u.includes('?') ? `${u}&ts=${Date.now()}` : `${u}?ts=${Date.now()}`;
}

/**
 * Endpoint para criar e publicar um post de imagem
 * POST /posts/create
 * Body JSON esperado:
 *   {
 *     "caption": "Minha legenda",
 *     "image_url": "https://exemplo.com/imagem.jpg"
 *   }
 */
router.post('/create', async (req, res) => {
  const { caption = '', image_url } = req.body || {};

  // Validação mínima
  if (!image_url) {
    return res.status(400).json({ ok: false, error: 'image_url é obrigatório' });
  }

  try {
    // 1) cria o container (ORDEM CORRIGIDA: image_url, caption) + bust de cache
    const creationId = await createImagePost(bust(image_url), caption);

    // 2) publica (AGORA publishPost retorna o ID diretamente)
    const mediaId = await publishPost(creationId);

    return res.json({ ok: true, media_id: mediaId, creation_id: creationId });
  } catch (err) {
    // Log detalhado (HTTP do Graph) e retorno com details pra debugar rápido
    const details = err?.response?.data || err?.details || { message: err.message };
    console.error('Erro /posts/create:', details);
    return res.status(500).json({ ok: false, error: 'Erro ao publicar', details });
  }
});

module.exports = router;
