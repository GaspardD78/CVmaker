/**
 * APEC ID Mapper — popup script.
 *
 * Lit l'état agrégé depuis `chrome.storage.local`, le rend dans la popup, et
 * propose deux exports :
 *  - TypeScript : prêt à coller dans `parsers/apec.ts` (objet `Record<string, number[]>`)
 *  - JSON       : pour archivage ou échange
 *
 * Live update : on écoute `chrome.storage.onChanged` pour rafraîchir la popup
 * à chaud quand une nouvelle capture arrive (cas où la popup reste ouverte
 * pendant qu'on coche des filtres dans l'onglet apec.fr).
 */

const FIELD_LABELS = {
  lieux:                'Lieux',
  fonctions:            'Fonctions',
  secteursActivite:     'Secteurs d\'activité',
  niveauxExperience:    'Niveaux d\'expérience',
  typesContrat:         'Types de contrat',
  typesConvention:      'Types de convention',
  anciennetePublication: 'Ancienneté publication',
};

document.addEventListener('DOMContentLoaded', () => {
  render();
  document.getElementById('btn-clear').addEventListener('click', onClear);
  document.getElementById('btn-copy-ts').addEventListener('click', () => onCopy('ts'));
  document.getElementById('btn-copy-json').addEventListener('click', () => onCopy('json'));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.store) render();
});

async function getStore() {
  const { store } = await chrome.storage.local.get('store');
  return (store && typeof store === 'object')
    ? { ids: store.ids ?? {}, captures: Array.isArray(store.captures) ? store.captures : [] }
    : { ids: {}, captures: [] };
}

async function render() {
  const store = await getStore();
  const empty   = document.getElementById('empty');
  const results = document.getElementById('results');
  const buckets = document.getElementById('buckets');
  const list    = document.getElementById('captures-list');
  const count   = document.getElementById('captures-count');

  buckets.innerHTML = '';
  list.innerHTML = '';

  const fieldsWithIds = Object.entries(store.ids).filter(([, ids]) => Object.keys(ids).length > 0);

  if (fieldsWithIds.length === 0 && store.captures.length === 0) {
    empty.hidden = false;
    results.hidden = true;
    return;
  }

  empty.hidden = true;
  results.hidden = false;

  for (const [field, ids] of fieldsWithIds) {
    const bucket = document.createElement('div');
    bucket.className = 'bucket';
    const h2 = document.createElement('h2');
    h2.textContent = `${FIELD_LABELS[field] ?? field} — ${Object.keys(ids).length}`;
    bucket.appendChild(h2);

    const ul = document.createElement('ul');
    // Tri par fréquence décroissante puis par ID croissant — ça met les IDs
    // les plus utilisés (donc plus fiables) en tête de liste.
    const sorted = Object.entries(ids).sort((a, b) =>
      (b[1] - a[1]) || (Number(a[0]) - Number(b[0])),
    );
    for (const [id, n] of sorted) {
      const li = document.createElement('li');
      li.textContent = n > 1 ? `${id} ×${n}` : id;
      ul.appendChild(li);
    }
    bucket.appendChild(ul);
    buckets.appendChild(bucket);
  }

  count.textContent = String(store.captures.length);
  for (const cap of store.captures.slice(0, 30)) {
    const li = document.createElement('li');
    const time = new Date(cap.capturedAt).toLocaleTimeString();
    const summary = cap.body
      ? Object.entries(cap.body)
          .filter(([, v]) => Array.isArray(v) && v.length > 0)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(' ')
      : '(body vide)';
    li.textContent = `${time} — ${summary || '(rien à afficher)'}`;
    list.appendChild(li);
  }
}

async function onClear() {
  await chrome.storage.local.remove('store');
  render();
}

async function onCopy(format) {
  const store = await getStore();
  const ids = store.ids ?? {};

  let text;
  if (format === 'ts') {
    // Format prêt à coller dans `parsers/apec.ts`. On commente chaque liste
    // pour que l'utilisateur la rapproche manuellement de ses départements.
    const lines = ['// Généré par APEC ID Mapper — vérifie les libellés avant utilisation.'];
    lines.push('export const APEC_IDS = {');
    for (const [field, bucket] of Object.entries(ids)) {
      const sorted = Object.keys(bucket).sort((a, b) => Number(a) - Number(b));
      const list = sorted.map(id => /^\d+$/.test(id) ? id : JSON.stringify(id)).join(', ');
      lines.push(`  ${JSON.stringify(field)}: [${list}],`);
    }
    lines.push('};');
    text = lines.join('\n');
  } else {
    text = JSON.stringify(ids, null, 2);
  }

  await navigator.clipboard.writeText(text);
  flashButton(format === 'ts' ? 'btn-copy-ts' : 'btn-copy-json');
}

function flashButton(id) {
  const btn = document.getElementById(id);
  const original = btn.textContent;
  btn.textContent = 'Copié ✓';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 1200);
}
