// server.js
require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const morgan  = require('morgan');
// const cors = require('cors');           // descomente se precisar liberar CORS

const scheduleRouter = require('./src/routes/schedule');
const postsRouter    = require('./src/routes/posts');
const webhookRouter  = require('./src/routes/webhook');
const instaRouter    = require('./src/routes/instagram');
const adsRouter      = require('./src/routes/ads');

const app = express();

/* ───── Middlewares básicos ───── */
app.use(helmet());
app.use(morgan('tiny'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use(cors());

/* ───── Rotas principais ───── */
app.use('/schedule',  scheduleRouter);  // (POST /schedule - criação de job)
app.use('/posts',     postsRouter);     // (GET /posts/ping | POST /posts/create)
app.use('/webhooks',  webhookRouter);   // (POST /webhooks/instagram …)
app.use('/instagram', instaRouter);
app.use('/ads',       adsRouter);

/* ───── Health-check & raiz ───── */
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/',        (_req, res) => res.send('jarvis-bot API online'));

/* ───── 404 genérico ───── */
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

/* ───── Middleware de erro ───── */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

/* ───── Inicialização ───── */
const PORT = process.env.PORT || 8080;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () =>
    console.log(`jarvis-bot API listening on port ${PORT}`),
  );
}

module.exports = app;
