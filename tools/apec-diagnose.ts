/**
 * apec-diagnose.ts — diagnostic « APEC HTTP 500 » (v2).
 *
 * Constat v1 : TOUTES les variantes de corps renvoient 500, même un corps
 * minimal — et la réponse est un JSON d'erreur (pas une page HTML). Le contenu
 * du corps n'est donc pas en cause : la requête atteint l'app APEC qui renvoie
 * une 500 applicative. Cette v2 cherche POURQUOI : elle dumpe le corps + les
 * headers de la réponse, et teste 4 hypothèses (cookies de session, variantes
 * de headers, endpoint, méthode).
 *
 * Lancement EN LOCAL (accès direct à apec.fr) :
 *   bun tools/apec-diagnose.ts
 *
 * Colle TOUTE la sortie : le corps de l'erreur 500 dira ce qu'APEC réclame.
 * Aucune donnée perso, aucun envoi ailleurs que vers apec.fr.
 */

const API = 'https://www.apec.fr/cms/webservices/rechercheOffre';
const SEARCH_PAGE = 'https://www.apec.fr/candidat/recherche-emploi.html/emploi';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const BASE_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  'Content-Type': 'application/json; charset=utf-8',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': SEARCH_PAGE,
  'Origin': 'https://www.apec.fr',
};

const MINIMAL_BODY = {
  motsCles: 'Recruteur',
  lieux: [], fonctions: [], secteursActivite: [], typesTeletravail: [],
  salaires: [], typesContrat: [], niveauxExperience: [],
  typeClient: 'CADRE',
  sorts: [{ type: 'DATE', direction: 'DESCENDING' }],
  pagination: { range: 50, startIndex: 0 },
  activeFiltre: true,
};

const SEP = '─'.repeat(72);

function dumpHeaders(h: Headers): void {
  const interesting = [
    'content-type', 'server', 'date', 'cache-control', 'x-cache',
    'cf-ray', 'x-amzn-requestid', 'x-amzn-errortype', 'via', 'x-powered-by',
    'www-authenticate', 'retry-after',
  ];
  for (const k of interesting) {
    const v = h.get(k);
    if (v) console.log(`    ${k}: ${v}`);
  }
  const sc = (h as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  if (sc.length) console.log(`    set-cookie (${sc.length}): ${sc.map((c) => c.split(';')[0]).join('; ')}`);
}

async function probe(label: string, url: string, init: RequestInit): Promise<void> {
  console.log(`\n${SEP}\n▶ ${label}`);
  try {
    const res = await fetch(url, init);
    console.log(`  status: ${res.status} ${res.statusText}`);
    dumpHeaders(res.headers);
    const text = await res.text();
    console.log(`  body (${text.length} chars):`);
    console.log(text.slice(0, 2000).replace(/^/gm, '    '));
  } catch (e) {
    console.log(`  ERREUR fetch: ${(e as Error).message}`);
  }
}

// ── 1) POST direct : voir le corps EXACT de l'erreur 500 ──────────────────────
await probe('1) POST direct (headers actuels du parser)', API, {
  method: 'POST',
  headers: BASE_HEADERS,
  body: JSON.stringify(MINIMAL_BODY),
});

// ── 2) Cookies de session : GET la page de recherche, rejouer les cookies ─────
console.log(`\n${SEP}\n▶ 2) Amorçage cookies via GET ${SEARCH_PAGE}`);
let cookieHeader = '';
try {
  const page = await fetch(SEARCH_PAGE, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } });
  console.log(`  GET status: ${page.status}`);
  const sc = (page.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  cookieHeader = sc.map((c) => c.split(';')[0]).join('; ');
  console.log(`  cookies récupérés: ${cookieHeader || '(aucun)'}`);
} catch (e) {
  console.log(`  ERREUR GET page: ${(e as Error).message}`);
}
await probe('   puis POST avec ces cookies', API, {
  method: 'POST',
  headers: { ...BASE_HEADERS, ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
  body: JSON.stringify(MINIMAL_BODY),
});

// ── 3) Variante headers : Content-Type sans charset + X-Requested-With ────────
await probe('3) POST + X-Requested-With, Content-Type sans charset', API, {
  method: 'POST',
  headers: { ...BASE_HEADERS, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  body: JSON.stringify(MINIMAL_BODY),
});

// ── 4) Sanity : GET sur l'endpoint (méthode inattendue → indice sur la route) ─
await probe('4) GET sur l’endpoint (sanity route)', API, {
  method: 'GET',
  headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' },
});
