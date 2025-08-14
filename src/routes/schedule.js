// src/routes/schedule.js
const express = require('express');
const crypto  = require('crypto');
const ig      = require('../services/instagram');
const store   = require('../db/firestore');
const log     = require('../utils/log');

const router = express.Router();

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
 *   "caption" : "Texto...",
 *   "publishAt": "2025-07-24T23:06:00Z"   // ISO-8601 (aceita "publish_at")
 * }
 */
router.post('/', async (req, res) => {
  const traceId =
    req.id || (req.headers['x-cloud-trace-context']?.split('/')[0] ?? '');

  try {
    const imageUrl  = req.body.imageUrl  ?? req.body.image_url;
    const caption   = req.body.caption;
    const publishAt = req.body.publishAt ?? req.body.publish_at;

    if (!imageUrl || !caption || !publishAt) {
      return res.status(400).json({
        ok: false,
        error:
          'Campos obrigatórios: imageUrl (ou image_url), caption, publishAt (ou publish_at) em ISO-8601',
        traceId,
      });
    }
    if (Number.isNaN(Date.parse(publishAt))) {
      return res.status(400).json({
        ok: false,
        error:
          'publishAt inválido (use ISO-8601, ex.: 2025-07-24T23:06:00Z)',
        traceId,
      });
    }

    const out = await store.enqueue({ imageUrl, caption, publishAt });
    return res.status(out?.queued ? 201 : 200).json({ traceId, ...out });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, error: e?.message || String(e), traceId });
  }
});

/* ----------------------------- Executor ------------------------------ */
async function runOnce() {
  const refs = await store.claimDue(10);
  let published = 0;
  let failed = 0;

  for (const ref of refs) {
    try {
      const data = (await ref.get()).data();
      const creation = await ig.createImagePost(data.imageUrl, data.caption);
      const creationId =
        typeof creation === 'string' ? creation : creation?.creationId;
      if (!creationId) throw new Error('createImagePost() returned no id');

      await ig.publishPost(creationId);
      await store.markDone(ref);
      published++;
    } catch (err) {
      failed++;
      await store.markFail(ref, err);
      (log.error || console.error)(
        { err: err?.response?.data || err?.message || String(err) },
        'schedule/run: publish error'
      );
    }
  }

  return { processed: refs.length, published, failed };
}

/**
 * POST /schedule/run
 * Chamado pelo Cloud Scheduler (header X-CRON-KEY).
 */
router.post('/run', async (req, res) => {
  const traceId =
    req.id || (req.headers['x-cloud-trace-context']?.split('/')[0] ?? '');

  const expected = process.env.CRON_KEY;
  if (expected) {
    const got = req.get('x-cron-key') ?? '';
    const a = Buffer.from(expected);
    const b = Buffer.from(got);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ ok: false, error: 'unauthorized', traceId });
    }
  }

  try {
    const result = await runOnce();
    if (!result.processed) return res.status(204).end(); // nada a processar
    return res.json({ ok: true, traceId, ...result });
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, error: e?.message || String(e), traceId });
  }
});

/* ----------------------------- Cron local ---------------------------- */
if (process.env.USE_LOCAL_CRON === 'true') {
  // carrega só quando necessário
  const cron = require('node-cron');
  cron.schedule('0 * * * * *', async () => {
    try { await runOnce(); }
    catch (e) {
      (log.error || console.error)({ err: e?.message || e }, 'cron/runOnce error');
    }
  });
}

module.exports = router;
