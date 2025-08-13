// src/utils/log.js
'use strict';

const os   = require('os');
const util = require('util');

const LEVELS = Object.freeze(['error', 'warn', 'info', 'debug']);

const envLevel = String(process.env.LOG_LEVEL || 'info').toLowerCase();
const currentIdx = LEVELS.includes(envLevel) ? LEVELS.indexOf(envLevel) : LEVELS.indexOf('info');
const allow = (lvl) => LEVELS.indexOf(lvl) <= currentIdx;

const asJson       = /^true$/i.test(process.env.LOG_JSON || '');           // LOG_JSON=true → JSON estruturado (Cloud Logging-friendly)
const warnToStderr = /^true$/i.test(process.env.LOG_WARN_TO_STDERR || ''); // opcional: warn no stderr
const serviceName  = process.env.LOG_NAME || 'jarvis-bot';

const baseMeta = Object.freeze({
  service: serviceName,
  env: process.env.NODE_ENV || 'production',
  pid: process.pid,
  host: os.hostname(),
});

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Error);

// redator de segredos (token/secret/password/authorization/appsecret_proof)
function redact(value) {
  const seen = new WeakSet();
  const re = /(token|secret|password|authorization|appsecret_proof)/i;
  return JSON.stringify(value, (k, v) => {
    if (re.test(k)) return '[redacted]';
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return '[circular]';
      seen.add(v);
    }
    return v;
  });
}

function write(lvl, args, fixedMeta = {}) {
  if (!allow(lvl)) return;

  const time = new Date().toISOString();
  const arr  = Array.isArray(args) ? args.slice() : [];

  // pega meta como último argumento se for objeto simples
  let meta;
  if (arr.length && isPlainObject(arr[arr.length - 1])) {
    meta = arr.pop();
  }

  // captura primeiro Error (em qualquer posição)
  const err = arr.find((a) => a instanceof Error);

  // formatação estilo console (%s, %d etc.)
  const message = arr.length ? util.format(...arr) : '';

  if (asJson) {
    // formato ideal p/ Cloud Logging
    const entry = {
      severity: lvl.toUpperCase(),
      time,
      message,
      ...baseMeta,
      ...fixedMeta,
    };
    if (err)  entry.error = { name: err.name, message: err.message, stack: err.stack };
    if (meta) entry.meta  = meta;

    const sink = (lvl === 'error' || (lvl === 'warn' && warnToStderr)) ? console.error : console.log;
    sink(redact(entry));
    return;
  }

  // texto simples
  const prefix = `[${time}] [${lvl}]`;
  const sink   = (lvl === 'error' || (lvl === 'warn' && warnToStderr)) ? console.error : console.log;

  if (message) sink(prefix, message);
  if (meta)    sink(prefix, redact({ ...fixedMeta, meta }));
  if (err && !message) sink(prefix, err.stack || err.message);
}

// logger “filho” com meta fixa (ex.: módulo/rota)
function child(extraMeta = {}) {
  const fixed = isPlainObject(extraMeta) ? extraMeta : {};
  return {
    error: (...a) => write('error', a, fixed),
    warn:  (...a) => write('warn',  a, fixed),
    info:  (...a) => write('info',  a, fixed),
    debug: (...a) => write('debug', a, fixed),
    child: (m) => child({ ...fixed, ...(m || {}) }),
  };
}

// instância padrão (compat com require('../utils/log'))
const log = child();
module.exports = log;
module.exports.default = log; // compat ESM
