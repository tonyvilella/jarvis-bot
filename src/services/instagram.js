// src/services/instagram.js (CommonJS)
'use strict';

const axios  = require('axios');
const crypto = require('crypto');
const log    = require('../utils/log');

// ===== Env / defaults ==================================================
const GRAPH_VERSION   = process.env.GRAPH_VERSION || 'v20.0';
const IG_USER_ID      = process.env.IG_USER_ID;
const APP_SECRET      = process.env.APP_SECRET;

// Preferência de token: PAGE_ACCESS_TOKEN -> IG_ACCESS_TOKEN -> USER_TOKEN_LL
const ACCESS_TOKEN =
  process.env.PAGE_ACCESS_TOKEN ||
  process.env.IG_ACCESS_TOKEN   ||
  process.env.USER_TOKEN_LL;

if (!IG_USER_ID)   throw new Error('IG_USER_ID ausente nas variáveis de ambiente');
if (!ACCESS_TOKEN) throw new Error('Defina PAGE_ACCESS_TOKEN (ou IG_ACCESS_TOKEN/USER_TOKEN_LL) nas variáveis de ambiente');

const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 20_000;
const HTTP_RETRIES       = Number(process.env.HTTP_RETRIES)       || 2;     // tentativas extras p/ 5xx / erros transientes
const RETRY_BASE_MS      = Number(process.env.RETRY_BASE_MS)      || 300;   // backoff: 300, 600, 1200…

const POLL_TRIES         = Number(process.env.IG_POLL_TRIES)      || 20;    // checagens do container
const POLL_DELAY_MS      = Number(process.env.IG_POLL_DELAY_MS)   || 2_000; // intervalo entre checagens

const MAX_CAPTION_LEN    = 2200;

// Base do Graph
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
log.info('IG Graph %s • user=%s', GRAPH_VERSION, IG_USER_ID);

// ===== Helpers =========================================================
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

function safeCaption(txt = '') {
  const s = String(txt ?? '');
  return s.length > MAX_CAPTION_LEN ? s.slice(0, MAX_CAPTION_LEN) : s;
}

// adiciona ?ts= para “bustar” cache do Instagram
function bust(url) {
  const u = String(url || '').trim();
  if (!u) return u;
  if (/\bts=\d+/.test(u)) return u;
  return u.includes('?') ? `${u}&ts=${Date.now()}` : `${u}?ts=${Date.now()}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// erros que vale a pena tentar novamente
function isTransient(err) {
  const s   = err?.response?.status;
  const sub = err?.response?.data?.error?.error_subcode;
  return (s >= 500 && s <= 599) || [4, 32, 613].includes(sub) ||
         ['ECONNABORTED','ECONNRESET','ETIMEDOUT','EAI_AGAIN'].includes(err?.code);
}

async function withRetry(fn, label = 'http') {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransient(err) || attempt >= HTTP_RETRIES) throw err;
      const delay = RETRY_BASE_MS * Math.pow(2, attempt);
      log.warn('%s falhou (%s). Retry em %dms [%d/%d]',
        label,
        err?.response?.status || err.code || 'err',
        delay, attempt + 1, HTTP_RETRIES);
      await sleep(delay);
      attempt++;
    }
  }
}

// ===== HTTP client (axios) ============================================
const api = axios.create({
  baseURL: BASE,
  timeout: REQUEST_TIMEOUT_MS,
});

api.interceptors.request.use((cfg) => {
  log.debug('→ %s %s', (cfg.method || 'GET').toUpperCase(), cfg.baseURL + cfg.url);
  return cfg;
});
api.interceptors.response.use(
  (res) => {
    log.debug('← %d %s', res.status, res.config.baseURL + res.config.url);
    return res;
  },
  (err) => {
    const s = err?.response?.status;
    const b = err?.response?.data;
    log.warn('✖ %s %s (%s)', err?.config?.method?.toUpperCase(), err?.config?.url, s || err.code);
    if (b) log.debug('  body:', b);
    return Promise.reject(err);
  }
);

// ===== Funções públicas ===============================================

/**
 * 1) Perfil — usado pela rota /instagram/ping
 */
async function getProfile() {
  const params = withAuthParams({ fields: 'id,username,followers_count,media_count' });
  const { data } = await withRetry(
    () => api.get(`/${IG_USER_ID}`, { params }),
    'getProfile'
  );
  log.info('getProfile ✅ %s', data?.username);
  return data;
}

/**
 * 2) Publicação de imagem (container -> publish com espera)
 */

// Cria o container (imagem ainda NÃO publicada)
async function createImageContainer(imageUrl, caption = '') {
  const params = withAuthParams({
    image_url: bust(imageUrl),
    caption  : safeCaption(caption),
  });

  const { data } = await withRetry(
    () => api.post(`/${IG_USER_ID}/media`, null, { params }),
    'createContainer'
  );
  log.info('container criado: %s', data?.id);
  return data.id; // creation_id
}

// compat com nome antigo usado nas rotas
async function createImagePost(image_url, caption = '') {
  return createImageContainer(image_url, caption);
}

// Alguns recursos de container expõem só 'status_code'.
// Pedir campos inexistentes pode quebrar; então pedimos apenas 'status_code'.
async function getContainer(creationId) {
  const params = withAuthParams({ fields: 'status_code' });
  const { data } = await withRetry(
    () => api.get(`/${creationId}`, { params }),
    'getContainer'
  );
  return data; // { id, status_code }
}

// Espera ativa até o container ficar FINISHED
async function waitForContainer(creationId, tries = POLL_TRIES, delayMs = POLL_DELAY_MS) {
  for (let i = 0; i < tries; i++) {
    const d = await getContainer(creationId);
    const s = d?.status_code;
    log.debug('container %s • status=%s (%d/%d)', creationId, s, i + 1, tries);
    if (s === 'FINISHED') return;
    if (s === 'ERROR') {
      const err = new Error('Container returned ERROR');
      err.details = d;
      throw err;
    }
    await sleep(delayMs);
  }
  const err = new Error('Timeout waiting media container');
  err.details = { creationId };
  throw err;
}

// Publica um container já criado
async function publishContainer(creationId) {
  await waitForContainer(creationId);
  const params = withAuthParams({ creation_id: creationId });

  const { data } = await withRetry(
    () => api.post(`/${IG_USER_ID}/media_publish`, null, { params }),
    'publish'
  );
  log.info('publicado: %s', data?.id);
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
  // compat com o que suas rotas já usam
  getProfile,
  createImagePost,
  publishPost,

  // utilitários extras
  createImageContainer,
  publishContainer,
  waitForContainer,
  publishImage,
};
