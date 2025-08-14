// src/utils/log.js
'use strict';

const os   = require('os');
const util = require('util');

const LEVELS = Object.freeze(['error', 'warn', 'info', 'debug']);

const envLevel   = String(process.env.LOG_LEVEL || 'info').toLowerCase();
const currentIdx = LEVELS.includes(envLevel) ? LEVELS.indexOf(envLevel) : LEVELS.indexOf('info');
const allow      = (lvl) => LEVELS.indexOf(lvl) <= currentIdx;

const asJson       = /^true$/i.test(process.env.LOG_JSON || '');            // LOG_JSON=true → uma linha JSON por log
const prettyJson   = /^true$/i.test(process.env.LOG_PRETTY || '') && (process.env.NODE_ENV !== 'production');
const warnToStderr = /^true$/i.test(process.env.LOG_WARN_TO_STDERR || '');  // opcional: warn no stderr
const serviceName  = process.env.LOG_NAME || 'jarvis-bot';

const baseMeta = Object.freeze({
  service: serviceName,
  env: process.env.NODE_ENV || 'production',
  pid: process.pid,
  host: os.hostname(),
});

const isPlainObject = (v) =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Error);

// Redação profunda (sem stringify aqui)
function redactDeep(value) {
  const seen = new WeakSet();
  const re = /(token|secret|password|authorization|appsecret_proof)/i;

  const walk = (v) => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '[circular]';
      seen.add(v);
      if (Array.isArray(v)) return v.map(walk);
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = re.test(k) ? '[redacted]' : walk(val);
      }
      return out;
    }
    return v;
  };

  return walk(value);
}

function jsonLine(obj) {
  return JSON.stringify(obj, null, prettyJson ? 2 : 0);
}

function write(lvl, args, fixedMeta = {}) {
  if (!allow(lvl)) return;

  const time = new Date().toISOString();
  const arr  = Array.isArray(args) ? args.slice() : [];

  // metadata no último argumento
  let meta;
  if (arr.length && isPlainObject(arr[arr.length - 1])) {
    meta = arr.pop();
  }

  // primeiro Error em qualquer posição
  const err = arr.find((a) => a instanceof Error);

  // mensagem formatada
  const message = arr.length ? util.format(...arr) : '';

  if (asJson) {
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
    sink(jsonLine(redactDeep(entry)));
    return;
  }

  // Texto simples
  const sink   = (lvl === 'error' || (lvl === 'warn' && warnToStderr)) ? console.error : console.log;
  const prefix = `[${time}] [${lvl}]`;

  if (message) sink(prefix, message);

  if (meta || (fixedMeta && Object.keys(fixedMeta).length)) {
    const payload = redactDeep({ ...fixedMeta, ...(meta ? { meta } : {}) });
    sink(prefix, jsonLine(payload));
  }

  if (err) sink(prefix, err.stack || err.message);
}

// logger “filho” com meta fixa (encadeável)
function child(extraMeta = {}) {
  const fixed = isPlainObject(extraMeta) ? extraMeta : {};
  return {
    error: (...a) => write('error', a, fixed),
    warn:  (...a) => write('warn',  a, fixed),
    info:  (...a) => write('info',  a, fixed),
    debug: (...a) => write('debug', a, fixed),
    child: (m) => child({ ...fixed, ...(m || {}) }), // mantém encadeamento de meta
  };
}

// instância padrão
const log = child();

module.exports = log;
// Exponha a fábrica sem sobrescrever log.child:
module.exports.childFactory = child;
module.exports.LEVELS       = LEVELS;
module.exports.default      = log; // compat ESM
