// scripts/get-page-token.js
require('dotenv').config();
const axios = require('axios');
const fs    = require('fs').promises;

(async () => {
  const { USER_TOKEN_LL, FB_PAGE_ID } = process.env;
  if (!USER_TOKEN_LL || !FB_PAGE_ID) {
    console.error('❌  .env precisa ter USER_TOKEN_LL e FB_PAGE_ID.');
    process.exit(1);
  }

  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v18.0/${FB_PAGE_ID}`,
      { params: { fields: 'access_token', access_token: USER_TOKEN_LL } }
    );

    if (!data.access_token) throw new Error('Page token vazio!');

    // sobrescreve IG_ACCESS_TOKEN no .env
    let envTxt = await fs.readFile('.env', 'utf8');
    envTxt = envTxt.replace(/IG_ACCESS_TOKEN=.*/g, `IG_ACCESS_TOKEN=${data.access_token}`);
    await fs.writeFile('.env', envTxt);

    console.log('✅  Page token salvo no .env!');
  } catch (err) {
    console.error('🚫  Falhou ao pegar Page token:', err.response?.data || err);
    process.exit(1);
  }
})();
