/**
 * APEC ID Mapper — service worker (MV3 background).
 *
 * Reçoit les requêtes capturées par `content.js`, en extrait les listes d'IDs
 * (`lieux`, `fonctions`, `secteursActivite`, `niveauxExperience`, `typesContrat`,
 * etc.) et les agrège dans `chrome.storage.local`. La popup lit ce store pour
 * afficher l'état de la cartographie.
 *
 * Format stocké :
 *   {
 *     captures: [{ capturedAt, url, body, response }, …],
 *     ids: {
 *       lieux:             { "711": <count> },
 *       fonctions:         { "101832": <count> },
 *       secteursActivite:  { … },
 *       niveauxExperience: { … },
 *       typesContrat:      { … },
 *     },
 *   }
 *
 * Limite de captures : 200 (rotation FIFO) — au-delà on garde les plus
 * récentes et on rote la fenêtre. L'extension n'a pas vocation à archiver
 * indéfiniment, juste à afficher l'état courant des IDs croisés sur les
 * dernières interactions utilisateur avec apec.fr.
 */

const MAX_CAPTURES = 200;

/** Listes JSON connues qu'on agrège. Si APEC ajoute un champ on l'ajoutera. */
const TRACKED_FIELDS = [
  'lieux',
  'fonctions',
  'secteursActivite',
  'niveauxExperience',
  'typesContrat',
  'typesConvention',
  'anciennetePublication',
];

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'APEC_REQUEST_CAPTURED') return;

  handleCapture(msg).then(() => sendResponse({ ok: true })).catch((err) => {
    console.warn('[APEC ID Mapper] capture handling error', err);
    sendResponse({ ok: false, error: String(err) });
  });
  return true; // keep the message channel open for async sendResponse
});

async function handleCapture(msg) {
  const store = await getStore();

  let parsedBody = null;
  if (typeof msg.body === 'string' && msg.body.length > 0) {
    try { parsedBody = JSON.parse(msg.body); } catch (_) { /* not JSON */ }
  }

  let parsedResponse = null;
  if (typeof msg.response === 'string' && msg.response.length > 0) {
    try { parsedResponse = JSON.parse(msg.response); } catch (_) { /* not JSON */ }
  }

  // Agrégation des IDs présents dans le body de la requête.
  if (parsedBody && typeof parsedBody === 'object') {
    for (const field of TRACKED_FIELDS) {
      const v = parsedBody[field];
      if (Array.isArray(v)) {
        const bucket = store.ids[field] ?? {};
        for (const id of v) {
          const key = String(id);
          bucket[key] = (bucket[key] ?? 0) + 1;
        }
        store.ids[field] = bucket;
      } else if (typeof v === 'number' || typeof v === 'string') {
        const bucket = store.ids[field] ?? {};
        const key = String(v);
        bucket[key] = (bucket[key] ?? 0) + 1;
        store.ids[field] = bucket;
      }
    }
  }

  // Capture brute compactée (pour debug + visibilité historique).
  store.captures.unshift({
    capturedAt: msg.capturedAt ?? Date.now(),
    url: msg.url ?? '',
    body: parsedBody,
    totalCount: parsedResponse?.totalCount ?? null,
  });
  if (store.captures.length > MAX_CAPTURES) {
    store.captures.length = MAX_CAPTURES;
  }

  await chrome.storage.local.set({ store });
}

async function getStore() {
  const { store } = await chrome.storage.local.get('store');
  if (store && typeof store === 'object') {
    if (!store.ids) store.ids = {};
    if (!Array.isArray(store.captures)) store.captures = [];
    return store;
  }
  return { captures: [], ids: {} };
}
