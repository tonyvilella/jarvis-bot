// src/routes/webhook.js
'use strict';

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const log     = require('../utils/log').child({ module: 'webhook' });

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'change-me';
const APP_SECRET   = process.env.APP_SECRET || ''; // se vazio, não valida assinatura

// JSON que preserva o corpo bruto p/ checar assinatura
const jsonWithRaw = express.json({
  type: '*/*',
  verify: (req, _res, buf) => { req.rawBody = buf; },
});

// GET /webhooks/instagram — verificação (hub.challenge)
router.get('/instagram', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  log.info('GET verify', { mode });

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// confere X-Hub-Signature-256, se houver APP_SECRET
function isValidSignature(req) {
  if (!APP_SECRET) return true; // em dev pode ficar sem validar
  try {
    const header   = String(req.get('x-hub-signature-256') || '');
    const provided = header.startsWith('sha256=') ? header.slice(7) : header;
    const expected = crypto.createHmac('sha256', APP_SECRET)
      .update(req.rawBody || Buffer.from(''))
      .digest('hex');
    if (provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

// POST /webhooks/instagram — consumo de eventos
router.post('/instagram', jsonWithRaw, (req, res) => {
  if (!isValidSignature(req)) {
    log.warn('assinatura inválida no webhook');
    return res.sendStatus(403);
  }

  const payload = req.body || {};
  const entries = Array.isArray(payload.entry) ? payload.entry.length : 0;

  log.info('evento recebido', { entries, object: payload.object || null });
  log.debug('payload', payload);

  return res.sendStatus(200);
});

module.exports = router;
