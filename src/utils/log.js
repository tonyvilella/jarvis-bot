const LEVELS = ['error', 'warn', 'info', 'debug'];
const current = (process.env.LOG_LEVEL || 'info').toLowerCase();
const allow = lvl => LEVELS.indexOf(lvl) <= LEVELS.indexOf(current);
const fmt = (lvl, args) => {
  const time = new Date().toISOString();
  return [`[${time}] [${lvl}]`, ...args];
};
module.exports = {
  error: (...a) => allow('error') && console.error(...fmt('error', a)),
  warn:  (...a) => allow('warn')  && console.warn (...fmt('warn',  a)),
  info:  (...a) => allow('info')  && console.log  (...fmt('info',  a)),
  debug: (...a) => allow('debug') && console.debug(...fmt('debug', a)),
};
