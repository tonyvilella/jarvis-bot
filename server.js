// server.js
require('dotenv').config();

const express = require('express');
const app = express();

app.use(express.json());

// rotas locais
const postsRouter     = require('./src/routes/posts');
const scheduleRouter  = require('./src/routes/schedule'); // novo
const adsRouter       = require('./src/routes/ads');
const instagramRouter = require('./src/routes/instagram');

app.use('/posts',     postsRouter);     // http://…/posts/…
app.use('/posts',     scheduleRouter);  // http://…/posts/schedule
app.use('/ads',       adsRouter);       // http://…/ads/…
app.use('/instagram', instagramRouter); // http://…/instagram/…

// rota raiz (Cloud Run)
app.get('/', (_req, res) => res.send('Jarvis-bot API online!'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API listening on ${PORT}`);
});
