// scripts/refresh-token.js   (CommonJS)
require('dotenv').config();
const axios = require('axios');
const fs    = require('fs').promises;

(async () => {
  const { APP_ID, APP_SECRET, USER_TOKEN_LL, FB_PAGE_ID } = process.env;

  if (!APP_ID || !APP_SECRET || !USER_TOKEN_LL || !FB_PAGE_ID) {
    console.error('❌  .env precisa ter APP_ID, APP_SECRET, USER_TOKEN_LL e FB_PAGE_ID.');
    process.exit(1);
  }

  try {
    /* 1️⃣  Trocar USER_TOKEN_LL por um novo long-lived */
    const llURL = 'https://graph.facebook.com/v18.0/oauth/access_token';
    const llRes = await axios.get(llURL, {
      params: {
        grant_type:        'fb_exchange_token',
        client_id:         APP_ID,
        client_secret:     APP_SECRET,
        fb_exchange_token: USER_TOKEN_LL
      }
    });

    const newUserToken = llRes.data.access_token;

    /* 2️⃣  Gerar Page Token usando o novo User Token */
    const pageURL = `https://graph.facebook.com/v18.0/${FB_PAGE_ID}`;
    const pgRes = await axios.get(pageURL, {
      params: {
        fields: 'access_token',
        access_token: newUserToken
      }
    });

    const newPageToken = pgRes.data.access_token;
    if (!newPageToken) throw new Error('Page token vazio!');

    /* 3️⃣  Salvar os dois tokens no .env */
    let envTxt = await fs.readFile('.env', 'utf8');
    envTxt = envTxt
      .replace(/USER_TOKEN_LL=.*/g, `USER_TOKEN_LL=${newUserToken}`)
      .replace(/IG_ACCESS_TOKEN=.*/g, `IG_ACCESS_TOKEN=${newPageToken}`);
    await fs.writeFile('.env', envTxt);

    console.log('✅  Tokens atualizados e salvos no .env!');
  } catch (err) {
    console.error('🚫  Falhou ao renovar token:', err.response?.data || err);
    process.exit(1);
  }
})();
