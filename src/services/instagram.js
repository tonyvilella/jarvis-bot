// src/services/instagram.js
const axios = require('axios');

const IG_USER_ID   = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const BASE = 'https://graph.facebook.com/v14.0';

/* ---------------------------------------------------------------------
 * 1. PERFIL – usado pela rota /instagram/ping
 * -------------------------------------------------------------------*/
async function getProfile () {
  const url    = `${BASE}/${IG_USER_ID}`;
  const params = { access_token: IG_ACCESS_TOKEN, fields: 'id,username,followers_count,media_count' };
  const { data } = await axios.get(url, { params });
  return data;                 // json com id, username, etc.
}

/* ---------------------------------------------------------------------
 * 2. PUBLICAÇÃO DE IMAGEM
 * -------------------------------------------------------------------*/
async function createImagePost (image_url, caption = '') {
  const url    = `${BASE}/${IG_USER_ID}/media`;
  const params = { image_url, caption, access_token: IG_ACCESS_TOKEN };
  const { data } = await axios.post(url, null, { params });  // media-creation-id
  return data.id;
}

async function publishPost (creationId) {
  const url    = `${BASE}/${IG_USER_ID}/media_publish`;
  const params = { creation_id: creationId, access_token: IG_ACCESS_TOKEN };
  const { data } = await axios.post(url, null, { params });  // published-media-id
  return data.id;
}

module.exports = { getProfile, createImagePost, publishPost };
