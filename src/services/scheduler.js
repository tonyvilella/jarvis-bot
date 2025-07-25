// src/services/scheduler.js
const cron = require('node-cron');
const { createImagePost, publishPost } = require('./instagram');

// Mantém os jobs ativos em memória
const jobs = new Map();

/**
 * Agenda um post.
 * @param {string}  caption     – legenda da foto
 * @param {string}  image_url   – URL pública (jpeg/png)
 * @param {string}  datetime    – ISO-8601 UTC (ex.: 2025-07-24T22:20:00Z)
 * @returns {string} jobId      – id interno do cron
 */
function schedulePost({ caption, image_url, datetime }) {
  const runAt  = new Date(datetime);        // ISO 8601 → objeto Date
  const cronExpr = `${runAt.getUTCMinutes()} ${runAt.getUTCHours()} `
                 + `${runAt.getUTCDate()} ${runAt.getUTCMonth() + 1} *`;

  // 1º passo: criar o container de mídia
  return createImagePost(image_url, caption).then(({ creationId }) => {
    const jobId = `job-${Date.now()}`;       // id único p/ mapa

    // 2º passo: agenda a publicação
    const task = cron.schedule(
      cronExpr,
      async () => {
        await publishPost(creationId);       // publica no feed
        task.stop();                         // executa uma vez só
        jobs.delete(jobId);                  // remove do mapa
      },
      { timezone: 'UTC' }
    );

    jobs.set(jobId, task);
    return jobId;                            // devolve ao caller
  });
}

module.exports = { schedulePost };
