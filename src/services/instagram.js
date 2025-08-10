// src/services/instagram.js (CommonJS)
'use strict';

const axios  = require('axios');
const crypto = require('crypto');

// ===== Env / defaults
const GRAPH_VERSION = process.env.GRAPH_VERSION || 'v20.0';
const IG_USER_ID    = process.env.IG_USER_ID;
const APP_SECRET    = process.env.APP_SECRET;

// Preferência de token: PAGE_ACCESS_TOKEN -> IG_ACCESS_TOKEN -> USER_TOKEN_LL
const ACCESS_TOKEN =
  process.env.PAGE_ACCESS_TOKEN ||
  process.env.IG_ACCESS_TOKEN   ||
  process.env.USER_TOKEN_LL;

if (!IG_USER_ID)  throw new Error('IG_USER_ID ausente nas variáveis de ambiente');
if (!ACCESS_TOKEN) throw new Error('Defina PAGE_ACCESS_TOKEN (ou IG_ACCESS_TOKEN/USER_TOKEN_LL) nas variáveis de ambiente');

const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// ---------- util ----------

function appSecretProof(token, secret) {
  if (!secret) return undefined;
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}
const PROOF = appSecretProof(ACCESS_TOKEN, APP_SECRET);

function withAuthParams(extra = {}) {
  return PROOF
    ? { access_token: ACCESS_TOKEN, appsecret_proof: PROOF, ...extra }
    : { access_token: ACCESS_TOKEN, ...extra };
}

// corta legenda no limite do IG (2.200 chars)
function safeCaption(txt = '') {
  const s = String(txt ?? '');
  return s.length > 2200 ? s.slice(0, 2200) : s;
}

// adiciona ?ts= para “bustar” cache do Instagram quando necessário
function bust(url) {
  const u = String(url || '').trim();
  if (!u) return u;
  if (/\bts=\d+/.test(u)) return u;
  return u.includes('?') ? `${u}&ts=${Date.now()}` : `${u}?ts=${Date.now()}`;
}

// ---------- http client ----------
const api = axios.create({
  baseURL: BASE,
  timeout: Number(process.env.REQUEST_TIMEOUT_MS) || 20000,
});

// =====================================================================
// 1) Perfil — usado pela rota /instagram/ping
// =====================================================================
async function getProfile() {
  const params = withAuthParams({ fields: 'id,username,followers_count,media_count' });
  const { data } = await api.get(`/${IG_USER_ID}`, { params });
  return data;
}

// =====================================================================
// 2) Publicação de imagem (container -> publish com espera)
// =====================================================================

// Cria o container (imagem ainda NÃO publicada)
async function createImageContainer(imageUrl, caption = '') {
  const params = withAuthParams({
    image_url: bust(imageUrl),
    caption:   safeCaption(caption),
  });
  const { data } = await api.post(`/${IG_USER_ID}/media`, null, { params });
  return data.id; // creation_id
}

// compat com seu nome antigo (mesma assinatura esperada nas rotas)
async function createImagePost(image_url, caption = '') {
  return createImageContainer(image_url, caption);
}

// Observação importante:
// Alguns tipos de container expõem apenas 'status_code'.
// Pedir campos inexistentes causa erro do Graph. Então solicitamos só 'status_code'.
async function getContainer(creationId) {
  const params = withAuthParams({ fields: 'status_code' });
  const { data } = await api.get(`/${creationId}`, { params });
  return data; // { id, status_code }
}

// Espera ativa até o container ficar FINISHED
async function waitForContainer(creationId, tries = 20, delayMs = 2000) {
  for (let i = 0; i < tries; i++) {
    const d = await getContainer(creationId);
    if (d?.status_code === 'FINISHED') return;
    if (d?.status_code === 'ERROR') {
      const err = new Error('Container returned ERROR');
      err.details = d;
      throw err;
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  const err = new Error('Timeout waiting media container');
  err.details = { creationId };
  throw err;
}

// Publica um container já criado
async function publishContainer(creationId) {
  await waitForContainer(creationId);
  const params = withAuthParams({ creation_id: creationId });
  const { data } = await api.post(`/${IG_USER_ID}/media_publish`, null, { params });
  return data; // { id: <published media id> }
}

// compat com seu nome antigo (retorna só o id)
async function publishPost(creationId) {
  const data = await publishContainer(creationId);
  return data.id;
}

// Helper “one‑shot”: cria + espera + publica
async function publishImage(imageUrl, caption = '') {
  const creationId = await createImageContainer(imageUrl, caption);
  const published  = await publishContainer(creationId);
  return { creationId, published };
}

module.exports = {
  // nomes antigos (compatíveis com suas rotas atuais)
  getProfile,
  createImagePost,
  publishPost,

  // utilitários novos (se quiser usar depois)
  createImageContainer,
  publishContainer,
  waitForContainer,
  publishImage,
};
