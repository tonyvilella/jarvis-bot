// src/routes/webhook.js
const express = require('express');
const router  = express.Router();

// ✅ Etapa de VERIFICAÇÃO (GET)
router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('✅ Webhook verificado pelo Meta!');
    return res.status(200).send(challenge);   // devolve o número que o Meta mandou
  }
  res.sendStatus(403); // token errado
});

// 🌐 Receber eventos (POST)
router.post('/', (req, res) => {
  console.log('🔔 Evento IG/Fb:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

module.exports = router;
