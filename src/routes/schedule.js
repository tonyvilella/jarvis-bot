// src/routes/schedule.js
const express = require('express');
const cron    = require('node-cron');
const crypto  = require('crypto');
const ig      = require('../services/instagram');
const log     = require('../utils/log');

const router = express.Router();

// Fila simples em memória (MVP). Em produção: Firestore/Postgres.
const queue = [];
let running = false;

/* ------------------------------- Health ------------------------------- */
router.get('/ping', (_req, res) => {
  res.json({ status: 'schedule ok' });
});

/* ----------------------------- Enfileirar ----------------------------- */
/**
 * POST /schedule
 * Body:
 * {
 *   "imageUrl": "...jpg",            // aceita também "image_url"
 *   "caption" : "Test ✍️",
 *   "publishAt": "2025-07-24T23:06:00Z"   // ISO-8601 (aceita "publish_at")
 * }
 */
router.post('/', (req, res) => {
  const imageUrl = req.body.imageUrl ?? req.body.image_url;
  const caption  = req.body.caption;
  const publishAt = req.body.publishAt ?? req.body.publish_at;

  if (!imageUrl || !caption || !publishAt) {
    return res.status(400).json({
      ok   : false,
      error: 'Campos obrigatórios: imageUrl (ou image_url), caption, publishAt (ou publish_at) em ISO',
      traceId: req.id
    });
  }

  const ts = Date.parse(publishAt);
  if (Number.isNaN(ts)) {
    return res.status(400).json({ ok: false, error: 'publishAt inválido (use ISO-8601, ex.: 2025-07-24T23:06:00Z)', traceId: req.id });
  }

  const idempotencyKey = crypto
    .createHash('sha256')
    .update(`${imageUrl}\n${caption}\n${publishAt}`)
    .digest('hex');

  // Evita duplicados por chave (não publicado)
  const exists = queue.some(j => !j.done && j.idempotencyKey === idempotencyKey);
  if (exists) {
    return res.status(200).json({ ok: true, queued: true, duplicate: true, idempotencyKey, traceId: req.id });
  }

  queue.push({ imageUrl, caption, publishAt, idempotencyKey, done: false, attempts: 0, lastError: null });
  return res.status(201).json({ ok: true, queued: true, idempotencyKey, traceId: req.id });
});

/* ----------------------------- Executor ------------------------------ */
async function processQueue() {
  const now = Date.now();
  let published = 0;
  let errors = 0;

  for (const job of queue) {
    if (job.done) continue;
    if (new Date(job.publishAt).getTime() > now) continue;

    try {
      const creation = await ig.createImagePost(job.imageUrl, job.caption);
      const creationId = typeof creation === 'string' ? creation : creation?.creationId;
      if (!creationId) throw new Error('createImagePost não retornou creationId');

      await ig.publishPost(creationId);
      job.done = true;
      job.lastError = null;
      published++;
      (log.info || console.log)({ caption: job.caption.slice(0, 50) }, '✅ Publicado');
    } catch (e) {
      job.attempts += 1;
      job.lastError = e?.response?.data || e?.message || String(e);
      errors++;
      (log.error || console.error)({ err: job.lastError, attempts: job.attempts }, '❌ Erro ao publicar');
      // (opcional) requeue/backoff simples aqui
    }
  }

  return { published, errors, pending: queue.filter(j => !j.done).length };
}

/**
 * POST /schedule/run
 * - Para ser chamado pelo Cloud Scheduler a cada minuto.
 * - Autenticação simples via header "X-CRON-KEY" = process.env.CRON_KEY (opcional).
 */
router.post('/run', async (req, res) => {
  const expectedKey = process.env.CRON_KEY;
  if (expectedKey) {
    const got = req.get('x-cron-key');
    if (got !== expectedKey) return res.status(401).json({ ok: false, error: 'unauthorized', traceId: req.id });
  }

  if (running) {
    return res.status(202).json({ ok: true, running: true, traceId: req.id });
  }

  running = true;
  try {
    const result = await processQueue();
    return res.json({ ok: true, running: false, traceId: req.id, ...result });
  } finally {
    running = false;
  }
});

/* ----------------------------- Cron local ---------------------------- */
if (process.env.USE_LOCAL_CRON === 'true') {
  cron.schedule('0 * * * * *', async () => {
    try {
      await processQueue();
    } catch (e) {
      (log.error || console.error)({ err: e?.message || e }, 'cron/processQueue error');
    }
  });
}

module.exports = router;
