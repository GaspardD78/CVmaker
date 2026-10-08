/**
 * ft-apec-check.ts — les offres APEC sont-elles exposées par l'API France Travail ?
 *
 * Recherche réelle : motsCles « chargé de recrutement », Île-de-France (region=11),
 * origineOffre=2 (offres partenaires). Affiche le nombre d'offres, la répartition
 * par `origineOffre.partenaires[].nom` et le détail de 3 offres APEC éventuelles.
 *
 * Lancement (identifiants = ceux de Paramètres > Veille > France Travail) :
 *   FT_CLIENT_ID=... FT_CLIENT_SECRET=... bun tools/ft-apec-check.ts
 *
 * Lecture seule, aucun changement du parser. Aucun envoi ailleurs que vers France Travail.
 */

const FT_TOKEN_URL  = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const FT_SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const PAGE_SIZE = 150;
const MAX_PAGES = 8; // range max 0-1149
const THROTTLE_MS = 350;

const clientId = process.env.FT_CLIENT_ID;
const clientSecret = process.env.FT_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('FT_CLIENT_ID et FT_CLIENT_SECRET requis (variables d\'environnement).');
  process.exit(1);
}

interface Partenaire { nom?: string; url?: string; logo?: string }
interface Offre {
  id?: string;
  intitule?: string;
  lieuTravail?: { libelle?: string };
  entreprise?: { nom?: string };
  salaire?: { libelle?: string; commentaire?: string };
  origineOffre?: { origine?: string; urlOrigine?: string; partenaires?: Partenaire[] };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getToken(): Promise<string> {
  const res = await fetch(FT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId!,
      client_secret: clientSecret!,
      scope: 'api_offresdemploiv2 o2dsoffre',
    }).toString(),
  });
  if (!res.ok) throw new Error(`OAuth2 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const token = await getToken();
const offres: Offre[] = [];
let total: number | null = null;

for (let page = 0; page < MAX_PAGES; page++) {
  const start = page * PAGE_SIZE;
  const params = new URLSearchParams({
    motsCles: 'chargé de recrutement',
    region: '11',          // Île-de-France
    origineOffre: '2',     // offres partenaires
    sort: '1',
    range: `${start}-${Math.min(start + PAGE_SIZE - 1, 1149)}`,
  });
  await sleep(THROTTLE_MS);
  const res = await fetch(`${FT_SEARCH_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (res.status === 204) break;
  if (!res.ok) throw new Error(`search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const cr = res.headers.get('Content-Range')?.match(/\/(\d+)\s*$/);
  if (cr) total = parseInt(cr[1], 10);
  const data = (await res.json()) as { resultats?: Offre[] };
  const batch = data.resultats ?? [];
  offres.push(...batch);
  if (batch.length < PAGE_SIZE || (total != null && start + PAGE_SIZE >= total)) break;
}

// Répartition par partenaire (une offre peut en citer plusieurs ; « (aucun) » sinon)
const parPartenaire = new Map<string, number>();
for (const o of offres) {
  const noms = (o.origineOffre?.partenaires ?? []).map(p => p.nom?.trim() || '(sans nom)');
  for (const n of noms.length ? noms : ['(aucun partenaire)']) {
    parPartenaire.set(n, (parPartenaire.get(n) ?? 0) + 1);
  }
}

console.log(`Offres récupérées : ${offres.length}${total != null ? ` (Content-Range total : ${total})` : ''}`);
console.log('\nRépartition par partenaire :');
for (const [nom, n] of [...parPartenaire].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${nom}`);
}

const estApec = (o: Offre) =>
  (o.origineOffre?.partenaires ?? []).some(p => /apec/i.test(p.nom ?? ''));
const apec = offres.filter(estApec);
console.log(`\nOffres APEC : ${apec.length}`);
if (apec.length === 0) {
  // Filet : « APEC » ailleurs dans l'offre (url d'origine, nom d'entreprise…)
  const ailleurs = offres.filter(o => /apec/i.test(JSON.stringify(o)));
  console.log(`Mentions « apec » ailleurs dans le JSON : ${ailleurs.length}`);
}
for (const o of apec.slice(0, 3)) {
  const sal = [o.salaire?.libelle, o.salaire?.commentaire].filter(Boolean).join(' ') || '(non renseigné)';
  console.log('\n— ' + (o.intitule ?? '(sans titre)'));
  console.log('  entreprise : ' + (o.entreprise?.nom ?? '(non renseignée)'));
  console.log('  lieu       : ' + (o.lieuTravail?.libelle ?? '(non renseigné)'));
  console.log('  salaire    : ' + sal);
  console.log('  URL origine: ' + (o.origineOffre?.urlOrigine ?? '(absente)'));
}
