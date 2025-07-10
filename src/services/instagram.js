// src/services/instagram.js
require('dotenv').config();
const axios = require('axios');

const IG_USER_ID      = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const BASE            = 'https://graph.facebook.com/v18.0';

async function getProfile() {
  const url = `${BASE}/${IG_USER_ID}`;
  const params = {
    fields: 'username,followers_count',
    access_token: IG_ACCESS_TOKEN,
  };
  const { data } = await axios.get(url, { params });
  return data;
}

async function createImagePost(caption = '', imageUrl) {
  const url = `${BASE}/${IG_USER_ID}/media`;
  const params = {
    image_url: imageUrl,
    caption,
    access_token: IG_ACCESS_TOKEN,
  };
  const { data } = await axios.post(url, null, { params });
  return data.id;
}

async function publishPost(creationId) {
  const url = `${BASE}/${IG_USER_ID}/media_publish`;
  const params = {
    creation_id: creationId,
    access_token: IG_ACCESS_TOKEN,
  };
  const { data } = await axios.post(url, null, { params });
  return data;
}

module.exports = { getProfile, createImagePost, publishPost };
