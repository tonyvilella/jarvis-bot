// src/services/metaAds.js
function createAd({ creativeId, campaignId, budget }) {
  console.log('[metaAds] simulando ad', { creativeId, campaignId, budget });
  return { ok: true, id: 'fake-ad-id' };
}
module.exports = { createAd };
