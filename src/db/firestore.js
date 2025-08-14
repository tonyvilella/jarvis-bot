// src/db/firestore.js
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const crypto = require('crypto');

const db  = new Firestore();
const col = db.collection(process.env.FS_COLLECTION || 'scheduled_posts');

function idemKey({ imageUrl, caption, publishAt }) {
  return crypto.createHash('sha256')
    .update(`${imageUrl}|${caption}|${publishAt}`)
    .digest('hex');
}

async function enqueue({ imageUrl, caption, publishAt }) {
  const key = idemKey({ imageUrl, caption, publishAt });
  const ref = col.doc(key);
  const snap = await ref.get();
  if (snap.exists) return { ok: true, queued: false, id: key };

  await ref.set({
    imageUrl, caption,
    publishAt: new Date(publishAt),
    status: 'queued',
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    expireAt: new Date(Date.now() + 30*24*60*60*1000) // 30 dias (TTL opcional)
  });
  return { ok: true, queued: true, id: key };
}

async function claimDue(limit = 10) {
  const now = new Date();
  // requer índice composto (status ASC + publishAt ASC)
  const qs = await col
    .where('status', '==', 'queued')
    .where('publishAt', '<=', now)
    .orderBy('publishAt', 'asc')
    .limit(limit)
    .get();

  const refs = [];
  for (const doc of qs.docs) {
    await db.runTransaction(async tx => {
      const fresh = await tx.get(doc.ref);
      if (fresh.exists && fresh.data().status === 'queued') {
        tx.update(doc.ref, { status: 'publishing', updatedAt: FieldValue.serverTimestamp() });
        refs.push(doc.ref);
      }
    });
  }
  return refs;
}

async function markDone(ref) {
  await ref.update({ status: 'done', updatedAt: FieldValue.serverTimestamp() });
}
async function markFail(ref, err) {
  const data = (await ref.get()).data() || {};
  const attempts = (data.attempts || 0) + 1;
  const backoffMs = Math.min(15*60*1000, 30000 * Math.pow(2, attempts-1)); // até 15min
  await ref.update({
    status: 'queued',
    attempts,
    lastError: `${err?.message || err}`,
    publishAt: new Date(Date.now() + backoffMs),
    updatedAt: FieldValue.serverTimestamp()
  });
}

module.exports = { enqueue, claimDue, markDone, markFail };
