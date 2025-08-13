// server.js
'use strict';
require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const morgan  = require('morgan');
// const cors = require('cors'); // descomente se precisar liberar CORS

const log = require('./src/utils/log');
const scheduleRouter = require('./src/routes/schedule');
const postsRouter    = require('./src/routes/posts');
const webhookRouter  = require('./src/routes/webhook');
const instaRouter    = require('./src/routes/instagram');
const adsRouter      = require('./src/routes/ads');

const app = express();

// Cloud Run/Proxy: respeita X-Forwarded-* (IP, proto, host)
app.set('trust proxy', true);
app.disable('x-powered-by');

/* ───── Middlewares básicos ───── */
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // evita bloqueio de assets externos
}));

// logger http → nosso logger
const httpLog = log.child({ module: 'http' });
app.use(morgan('tiny', { stream: { write: msg => httpLog.info(msg.trim()) } }));

/* ───── Webhook ANTES do body-parser global ─────
   (o router do webhook usa um json parser próprio que preserva req.rawBody
    para validar X-Hub-Signature-256 do Meta) */
app.use('/webhooks', webhookRouter);

// Body-parser global para o resto das rotas
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
// app.use(cors()); // habilite se precisar liberar CORS

/* ───── Rotas principais ───── */
app.use('/schedule',  scheduleRouter);   // POST /schedule
app.use('/posts',     postsRouter);      // GET /posts/ping | POST /posts/create
app.use('/instagram', instaRouter);
app.use('/ads',       adsRouter);

/* ───── Health-checks ───── */
app.get('/health',  (_req, res) => res.json({ status: 'ok' })); // liveness
app.get('/healthz', (_req, res) => res.status(200).send('ok')); // readiness simples
app.get('/',        (_req, res) => res.send('jarvis-bot API online'));

/* ───── 404 genérico ───── */
app.use((req, res) => {
  log.warn('404 %s %s', req.method, req.originalUrl);
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

/* ───── Middleware de erro ───── */
app.use((err, req, res, _next) => {
  log.error('Unhandled error on %s %s', req.method, req.originalUrl, err);
  res.status(500).json({ error: 'Internal server error' });
});

/* ───── Airbags do processo ───── */
process.on('unhandledRejection', (reason, p) => {
  log.error('unhandledRejection at %s', p, reason);
});
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', err);
});

/* ───── Inicialização ───── */
const PORT = Number(process.env.PORT) || 8080;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    log.info('jarvis-bot listening on port %d (env=%s)', PORT, process.env.NODE_ENV || 'development');
  });
}

module.exports = app;
