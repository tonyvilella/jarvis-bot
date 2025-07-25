const express = require('express');
const router  = express.Router();

/* ✅ Health-check - GET /webhook/ping */
router.get('/ping', (_req, res) => {
  res.json({ status: 'webhook ok' });
});

/* ✅ Etapa de VERIFICAÇÃO (GET /webhook?hub.mode=... ) */
router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('✅ Webhook verificado pelo Meta!');
    return res.status(200).send(challenge);   // devolve challenge
  }
  res.sendStatus(403);                         // token errado
});

/* 🔔 Receber eventos (POST /webhook) */
router.post('/', (req, res) => {
  console.log('⚡ Evento IG/Fb:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

module.exports = router;
