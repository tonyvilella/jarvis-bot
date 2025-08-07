// server.js
require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');   // boas práticas de segurança
const morgan  = require('morgan');   // logs de requisição
const app     = express();

// ────────────────────────────
// Middlewares básicos
// ────────────────────────────
app.use(helmet());
app.use(morgan('tiny'));
app.use(express.json());

// ────────────────────────────
// Rotas principais
// ────────────────────────────
const scheduleRouter = require('./src/routes/schedule');
const postsRouter    = require('./src/routes/posts');

app.use('/posts/schedule', scheduleRouter); // alias primeiro
app.use('/schedule',        scheduleRouter);
app.use('/posts',           postsRouter);

app.use('/webhook',   require('./src/routes/webhook'));
app.use('/instagram', require('./src/routes/instagram'));
app.use('/ads',       require('./src/routes/ads'));

// ────────────────────────────
// Health‑check & raiz
// ────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/',        (_req, res) => res.send('jarvis-bot API online'));

// ────────────────────────────
// 404 para rotas não tratadas
// ────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// Middleware de erro genérico
app.use((err, _req, res, _next) => {
  /* eslint-disable no-console */
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ────────────────────────────
// Inicialização do servidor
// ────────────────────────────
const PORT = process.env.PORT || 8080;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () =>
    console.log(`jarvis‑bot API listening on port ${PORT}`)
  );
}

// Exporta para testes
module.exports = app;
