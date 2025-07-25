// src/routes/schedule.js
const express = require('express');
const cron    = require('node-cron');
const ig      = require('../services/instagram');   // precisa exportar createImagePost / publishPost

const router = express.Router();
const queue  = [];               // memória simples

/* -------------------------------------------------------------------- */
/*  API DE AGENDAMENTO DE POSTS                                         */
/* -------------------------------------------------------------------- */

/**
 * GET /schedule/ping  – health-check
 */
router.get('/ping', (_req, res) => {
  res.json({ status: 'schedule ok' });
});

/**
 * POST /schedule
 *
 * Body:
 * {
 *   "imageUrl": "...jpg",
 *   "caption" : "Test ✍️",
 *   "publishAt": "2025-07-24T23:06:00Z"   // ISO-8601 UTC
 * }
 */
router.post('/', (req, res) => {
  const { imageUrl, caption, publishAt } = req.body;

  if (!imageUrl || !caption || !publishAt) {
    return res.status(400).json({
      ok   : false,
      error: 'Campos obrigatórios: imageUrl, caption, publishAt',
    });
  }

  queue.push({ imageUrl, caption, publishAt, done: false });
  return res.status(201).json({ ok: true, queued: true });
});

/* -------------------------------------------------------------------- */
/*  CRON – verifica a fila a cada minuto                                */
/* -------------------------------------------------------------------- */

// dispara no segundo 0 de todo minuto
cron.schedule('0 * * * * *', async () => {
  const now = Date.now();

  for (const job of queue) {
    if (job.done) continue;
    if (new Date(job.publishAt).getTime() > now) continue;

    try {
      const creationId = await ig.createImagePost(job.imageUrl, job.caption);
      await ig.publishPost(creationId);

      job.done = true;
      console.log('✅  Publicado:', job.caption.slice(0, 30));
    } catch (e) {
      console.error('❌ Erro ao publicar:', e.response?.data || e.message);
    }
  }
});

module.exports = router;
