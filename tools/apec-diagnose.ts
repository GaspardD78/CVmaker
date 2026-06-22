/**
 * apec-diagnose.ts — diagnostic ciblé de l'erreur « APEC HTTP 500 ».
 *
 * Pourquoi ce script ?
 *   L'API interne APEC (`POST /cms/webservices/rechercheOffre`) renvoie un 500
 *   persistant sur certaines requêtes du watcher. On ne peut pas le reproduire
 *   depuis l'environnement Claude Code (allowlist d'egress), donc ce script se
 *   lance EN LOCAL (accès direct à apec.fr) et isole la cause en testant des
 *   variantes du corps qui a échoué en production.
 *
 * Lancement :
 *   bun tools/apec-diagnose.ts
 *   (ou : node tools/apec-diagnose.ts  — Node ≥ 18 pour `fetch` global)
 *
 * Lecture du résultat :
 *   - A est le corps exact qui échoue en prod (attendu : 500).
 *   - Si B (sans « ET NON ») passe en 200 → l'opérateur d'exclusion est en cause.
 *   - Si C (« SAUF ») passe en 200 → le bon opérateur d'exclusion est SAUF.
 *   - Si D (lieux:[]) passe en 200 → ce sont les `lieux` (IDs) qui sont rejetés.
 *   - Si E (minimal) échoue aussi → indisponibilité / évolution API côté APEC.
 *   - F/G isolent le type de contrat et la taille de page.
 *
 * Aucune donnée personnelle, aucun envoi ailleurs que vers apec.fr.
 */

const URL = 'https://www.apec.fr/cms/webservices/rechercheOffre';

// Mêmes en-têtes que la commande Rust `fetch_apec_api` (src-tauri/src/lib.rs).
const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Content-Type': 'application/json; charset=utf-8',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://www.apec.fr/candidat/recherche-emploi.html/emploi',
  'Origin': 'https://www.apec.fr',
};

// Corps de base commun (cf. parsers/apec.ts).
const base = {
  motsCles: '',
  lieux: [] as number[],
  fonctions: [] as number[],
  secteursActivite: [] as number[],
  typesTeletravail: [] as number[],
  salaires: [] as number[],
  typesContrat: [] as number[],
  niveauxExperience: [] as number[],
  typeClient: 'CADRE',
  sorts: [{ type: 'DATE', direction: 'DESCENDING' }],
  pagination: { range: 50, startIndex: 0 },
  activeFiltre: true,
};

// motsCles réellement envoyé en prod (extrait des logs).
const OR_GROUP =
  '(Recruteur OU "Talent Acquisition Manager" OU "Talent Partner" OU "Chargé de recrutement")';
const EXCL_GROUP =
  '(stagiaire OU alternant OU ingénieur OU technicien OU commercial OU vendeur OU cariste OU électricien OU BTP OU Restauration OU VPC)';

const full = `${OR_GROUP} ET NON ${EXCL_GROUP}`;
const sauf = `${OR_GROUP} SAUF ${EXCL_GROUP}`;
const idf = [78, 92, 75, 95, 93];

const cases: Array<[string, Record<string, unknown>]> = [
  ['A. corps exact (échoue en prod)', { ...base, motsCles: full, lieux: idf, typesContrat: [101888] }],
  ['B. sans "ET NON" (OR group seul)', { ...base, motsCles: OR_GROUP, lieux: idf, typesContrat: [101888] }],
  ['C. "SAUF" au lieu de "ET NON"', { ...base, motsCles: sauf, lieux: idf, typesContrat: [101888] }],
  ['D. corps exact mais lieux:[]', { ...base, motsCles: full, lieux: [], typesContrat: [101888] }],
  ['E. minimal (1 mot, 0 filtre)', { ...base, motsCles: 'Recruteur' }],
  ['F. corps exact mais typesContrat:[]', { ...base, motsCles: full, lieux: idf }],
  ['G. corps exact mais pagination.range:20', { ...base, motsCles: full, lieux: idf, typesContrat: [101888], pagination: { range: 20, startIndex: 0 } }],
];

function snippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

for (const [label, body] of cases) {
  try {
    const res = await fetch(URL, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
    const text = await res.text();
    let info = '';
    try {
      const json = JSON.parse(text) as { totalCount?: number; resultats?: unknown[] };
      info = `totalCount=${json.totalCount ?? '?'} resultats=${json.resultats?.length ?? '?'}`;
    } catch {
      info = `body: ${snippet(text)}`;
    }
    console.log(`${res.status}  ${label}  →  ${info}`);
  } catch (e) {
    console.log(`ERR  ${label}  →  ${(e as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, 700)); // throttle léger
}
