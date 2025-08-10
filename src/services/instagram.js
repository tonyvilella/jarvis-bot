// src/services/instagram.js (CommonJS)
'use strict';

const axios  = require('axios');
const crypto = require('crypto');
const log    = require('../utils/log');

// ======================= Config / Env =======================
const GRAPH_VERSION     = process.env.GRAPH_VERSION || 'v20.0';
const IG_USER_ID        = process.env.IG_USER_ID;
const APP_SECRET        = process.env.APP_SECRET;

const ACCESS_TOKEN =
  process.env.PAGE_ACCESS_TOKEN ||
  process.env.IG_ACCESS_TOKEN   ||
  process.env.USER_TOKEN_LL;

if (!IG_USER_ID)   throw new Error('IG_USER_ID ausente nas variáveis de ambiente');
if (!ACCESS_TOKEN) throw new Error('Defina PAGE_ACCESS_TOKEN (ou IG_ACCESS_TOKEN/USER_TOKEN_LL) nas variáveis de ambiente');

const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 20_000;
const HTTP_RETRIES       = Number(process.env.HTTP_RETRIES)       || 2;     // tentativas extras p/ 5xx / erros de rede
const RETRY_BASE_MS      = Number(process.env.RETRY_BASE_MS)      || 300;   // backoff exponencial: base, 2x, 4x…

const POLL_TRIES         = Number(process.env.IG_POLL_TRIES)      || 20;    // quantas checagens do container
const POLL_DELAY_MS      = Number(process.env.IG_POLL_DELAY_MS)   || 2_000; // intervalo entre checagens

const MAX_CAPTION_LEN    = 2200;

const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
log.info('IG Graph %s • user=%s', GRAPH_VERSION, IG_USER_ID);

// ======================= Helpers ============================
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

function bust(url) {
  const u = String(url || '').trim();
  if (!u) return u;
  if (/\bts=\d+/.test(u)) return u;
  return u.includes('?') ? `${u}&ts=${Date.now()}` : `${u}?ts=${Date.now()}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function enrichAxiosError(err, ctx) {
  const e = new Error(ctx ? `${ctx}: ${err.message}` : err.message);
  e.code   = err.code;
  e.status = err.response?.status;
  e.data   = err.response?.data;
  e.cause  = err;
  return e;
}

async function withRetry(fn, ctx) {
  let attempt = 0;
  // 1ª tentativa + HTTP_RETRIES re-tentativas
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status    = err.response?.status;
      const retriable =
        (status >= 500 && status <= 599) ||
        ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err.code);

      if (!retriable || attempt >= HTTP_RETRIES) {
        throw enrichAxiosError(err, ctx);
      }

      const delay = RETRY_BASE_MS * Math.pow(2, attempt);
      log.warn('%s falhou (%s %s). Retry em %dms [%d/%d]',
        ctx || 'http', status || err.code || '-', err.message, delay, attempt + 1, HTTP_RETRIES);
      await sleep(delay);
      attempt++;
    }
  }
}

// ======================= HTTP Client ========================
const api = axios.create({
  baseURL: BASE,
  timeout: REQUEST_TIMEOUT_MS,
});

// Logs enxutos (sem tokens)
api.interceptors.request.use((config) => {
  log.debug('HTTP %s %s', config.method?.toUpperCase(), config.url);
  return config;
});
api.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(err)
);

// ======================= Funcões públicas ===================

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
    'createImageContainer'
  );
  log.info('container criado: %s', data?.id);
  return data.id; // creation_id
}

// compat com nome antigo usado nas rotas
async function createImagePost(image_url, caption = '') {
  return createImageContainer(image_url, caption);
}

// Alguns recursos de container têm só 'status_code'.
// Pedir campos inexist
