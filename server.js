// server.js
require('dotenv').config();
const express = require('express');
const app     = express();

app.use(express.json());

// rotas principais (alias /posts/schedule antes de /posts)
app.use('/posts/schedule', require('./src/routes/schedule'));
app.use('/schedule',       require('./src/routes/schedule'));
app.use('/posts',          require('./src/routes/posts'));

app.use('/webhook',   require('./src/routes/webhook'));
app.use('/instagram', require('./src/routes/instagram'));
app.use('/ads',       require('./src/routes/ads'));

// rota de saúde
app.get('/', (_req, res) => res.send('jarvis-bot API online'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`API listening on ${PORT}`));
