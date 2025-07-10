// src/services/scheduler.js
const cron = require('node-cron');
const { createImagePost, publishPost } = require('./instagram');

// manter um registro simples dos jobs em memória
const jobs = new Map();

function schedulePost({ caption, image_url, datetime }) {
  const runAt   = new Date(datetime); // ISO 8601
  const cronExpr = `${runAt.getUTCMinutes()} ${runAt.getUTCHours()} ${runAt.getUTCDate()} ${runAt.getUTCMonth() + 1} *`;

  return createImagePost(caption, image_url).then((creationId) => {
    const jobId = `job-${Date.now()}`;        // gera ID único

    const task = cron.schedule(
      cronExpr,
      async () => {
        await publishPost(creationId);
        task.stop();
        jobs.delete(jobId);                   // limpa após executar
      },
      { timezone: 'UTC' }
    );

    jobs.set(jobId, task);
    return jobId;                             // devolve o ID
  });
}

module.exports = { schedulePost };
