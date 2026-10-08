/**
 * apec-ft-overlap.ts — les offres des alertes APEC sont-elles aussi dans l'API France Travail ?
 *
 * Lit les .eml d'alerte APEC de specs/007-apec-et-recovery/fixtures/ (ou ceux passés en
 * argument), extrait titre / entreprise / lieu de chaque offre, puis cherche dans l'API
 * France Travail (motsCles = titre, département de l'offre ; repli motsCles = titre + entreprise)
 * une offre correspondante. Le rapprochement réutilise la logique de dédoublonnage de
 * resume-forge/src/lib/watcher/offer-dedup.ts (titre, entreprise et lieu normalisés).
 *
 * Lancement (identifiants = ceux de Paramètres > Veille > France Travail) :
 *   FT_CLIENT_ID=... FT_CLIENT_SECRET=... bun tools/apec-ft-overlap.ts
 *   bun tools/apec-ft-overlap.ts mon-alerte.eml        # fichiers précis
 *   bun tools/apec-ft-overlap.ts --parse-only          # lit les .eml, n'appelle pas France Travail
 *   bun tools/apec-ft-overlap.ts --debug               # affiche aussi le texte lu autour de chaque offre
 *
 * Niveaux de correspondance (titre normalisé identique ET même département) :
 *   certaine  : l'entreprise coïncide aussi
 *   probable  : l'offre France Travail ne donne pas d'entreprise (fréquent chez les multidiffuseurs)
 *   possible  : l'entreprise diffère (même poste republié par un cabinet ?) — NON compté comme trouvée
 *
 * Lecture seule. Aucun envoi ailleurs que vers France Travail. Les .eml restent en local :
 * retirez toute donnée personnelle avant de les déposer dans le dépôt (voir fixtures/README.md).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { normalizeCompany, normalizeLocation, normalizeTitle as dedupNormalizeTitle } from '../resume-forge/src/lib/watcher/offer-dedup';

/** Logique d'offer-dedup, plus la mention de genre sans parenthèses (« H/F » → « h f ») que France Travail écrit souvent. */
const normalizeTitle = (t: string): string =>
  dedupNormalizeTitle(t).replace(/\b[hfx](?: [hfx])+\b/g, ' ').replace(/\s+/g, ' ').trim();

const FIXTURES_DIR = resolve(import.meta.dir, '../specs/007-apec-et-recovery/fixtures');
const FT_TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const FT_SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const THROTTLE_MS = 350;
const PAGE_SIZE = 150;
const MAX_PAGES = 2;

const args = process.argv.slice(2);
const PARSE_ONLY = args.includes('--parse-only');
const DEBUG = args.includes('--debug');
const fileArgs = args.filter(a => !a.startsWith('--'));

// ── Lecture des .eml ─────────────────────────────────────────────────────────

interface ApecOffer {
  file: string;
  title: string;
  company: string | null;
  location: string | null;
  department: string | null;
  url: string | null;
  context: string[];
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset.toLowerCase().replace(/^"|"$/g, '')).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function decodeBody(body: string, encoding: string, charset: string): string {
  const enc = encoding.toLowerCase().trim();
  if (enc === 'base64') {
    return decodeBytes(Uint8Array.from(Buffer.from(body.replace(/\s+/g, ''), 'base64')), charset);
  }
  if (enc === 'quoted-printable') {
    const raw = body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
    return decodeBytes(Uint8Array.from(raw, c => c.charCodeAt(0)), charset);
  }
  return body;
}

function parseHeaders(block: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const unfolded = block.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return headers;
}

/** Parties text/html (ou à défaut text/plain) d'un message MIME, décodées. */
function mimeTexts(raw: string): { html: string[]; plain: string[] } {
  const out = { html: [] as string[], plain: [] as string[] };
  const split = raw.search(/\r?\n\r?\n/);
  const head = parseHeaders(split >= 0 ? raw.slice(0, split) : raw);
  const body = split >= 0 ? raw.slice(split).replace(/^\r?\n\r?\n/, '') : '';
  const type = head['content-type'] ?? 'text/plain';
  const boundary = type.match(/boundary="?([^";\s]+)"?/i)?.[1];
  if (/multipart\//i.test(type) && boundary) {
    for (const part of body.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?`))) {
      if (part.trim()) {
        const sub = mimeTexts(part.replace(/^\r?\n/, ''));
        out.html.push(...sub.html);
        out.plain.push(...sub.plain);
      }
    }
    return out;
  }
  const charset = type.match(/charset="?([^";\s]+)"?/i)?.[1] ?? 'utf-8';
  const text = decodeBody(body, head['content-transfer-encoding'] ?? '7bit', charset);
  if (/text\/html/i.test(type)) out.html.push(text);
  else if (/text\/plain/i.test(type)) out.plain.push(text);
  return out;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', agrave: 'à', ecirc: 'ê', ccedil: 'ç' };
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m);
}
function htmlToLines(html: string): string[] {
  return decodeEntities(
    html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|td|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' '),
  ).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Département depuis un lieu APEC (« Paris 08 - 75 », « Nanterre (92) », « 75008 Paris »). */
function departmentOf(text: string | null): string | null {
  if (!text) return null;
  const cp = text.match(/\b(\d{5})\b/);
  if (cp) return cp[1].startsWith('97') ? cp[1].slice(0, 3) : cp[1].slice(0, 2);
  const dep = text.match(/(?:\(|-\s*|,\s*)(\d{2,3}|2[AB])\)?\s*$/i) ?? text.match(/\((\d{2,3}|2[AB])\)/i);
  if (dep) return dep[1].toUpperCase();
  return /\bparis\b/i.test(text) ? '75' : null;
}

const LOCATION_RE = /\b\d{5}\b|\(\d{2,3}\)|\s-\s\d{2,3}\s*$|\bparis\b|île-de-france|ile-de-france|\bfrance\b/i;
const NOISE_RE = /désinscri|unsubscribe|se connecter|mon compte|voir (?:toutes|plus)|modifier|gérer|supprimer cette alerte|apec\.fr$|^apec$/i;

function extractOffers(file: string, html: string): ApecOffer[] {
  const offers: ApecOffer[] = [];
  const seen = new Set<string>();
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (let i = 0; i < anchors.length; i++) {
    const [full, href, inner] = anchors[i];
    const title = htmlToLines(inner).join(' ').trim();
    if (title.length < 8 || NOISE_RE.test(title) || !/apec|offre|emploi|click|track/i.test(href)) continue;
    if (!/detail-offre|offre|emploi/i.test(href) && !/apec\.fr/i.test(href)) continue;
    if (seen.has(title)) continue;
    seen.add(title);
    // Texte entre cette offre et la suivante : entreprise, lieu, contrat, salaire…
    const start = (anchors[i].index ?? 0) + full.length;
    const end = i + 1 < anchors.length ? (anchors[i + 1].index ?? html.length) : Math.min(html.length, start + 2500);
    const context = htmlToLines(html.slice(start, end)).slice(0, 8);
    const location = context.find(l => LOCATION_RE.test(l)) ?? null;
    const company = context.find(l => l !== location && l.length >= 2 && l.length <= 80 && !/€|cdi|cdd|intérim|il y a|publi|^\d/i.test(l)) ?? null;
    offers.push({ file, title, company, location, department: departmentOf(location), url: href, context });
  }
  return offers;
}

function loadOffers(): ApecOffer[] {
  const files = fileArgs.length > 0
    ? fileArgs.map(f => resolve(f))
    : (() => {
        try { return readdirSync(FIXTURES_DIR).filter(f => f.toLowerCase().endsWith('.eml')).map(f => join(FIXTURES_DIR, f)); }
        catch { return []; }
      })();
  if (files.length === 0) {
    console.error(`Aucun .eml trouvé (dossier : ${FIXTURES_DIR}). Déposez-y vos e-mails d'alerte APEC, ou passez leur chemin en argument.`);
    process.exit(1);
  }
  const all: ApecOffer[] = [];
  for (const file of files) {
    const raw = readFileSync(file, 'latin1');
    const { html, plain } = mimeTexts(raw);
    const source = html.length > 0 ? html.join('\n') : '';
    const offers = source ? extractOffers(file, source) : [];
    console.log(`${file.split('/').pop()} : ${offers.length} offre(s) lue(s)${html.length === 0 ? ` (pas de partie HTML ; ${plain.length} partie(s) texte non exploitée(s))` : ''}`);
    if (offers.length === 0 && source) {
      console.log('  Aucune offre reconnue. Début du texte lu :');
      for (const l of htmlToLines(source).slice(0, 25)) console.log('   | ' + l);
    }
    all.push(...offers);
  }
  return all;
}

// ── France Travail ───────────────────────────────────────────────────────────

interface FtOffre {
  id?: string;
  intitule?: string;
  entreprise?: { nom?: string };
  lieuTravail?: { libelle?: string; codePostal?: string; commune?: string };
  origineOffre?: { origine?: string; urlOrigine?: string; partenaires?: Array<{ nom?: string }> };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getToken(): Promise<string> {
  const id = process.env.FT_CLIENT_ID;
  const secret = process.env.FT_CLIENT_SECRET;
  if (!id || !secret) {
    console.error("FT_CLIENT_ID et FT_CLIENT_SECRET requis (ou utilisez --parse-only).");
    process.exit(1);
  }
  const res = await fetch(FT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'api_offresdemploiv2 o2dsoffre' }).toString(),
  });
  if (!res.ok) throw new Error(`OAuth2 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** motsCles France Travail = AND implicite : mots du titre, sans mention de genre ni ponctuation. */
function keywordsOf(...parts: Array<string | null>): string {
  return parts.filter((p): p is string => !!p).map(p => normalizeTitle(p)).join(' ').split(' ').filter(w => w.length > 1).slice(0, 8).join(' ');
}

async function searchFt(token: string, motsCles: string, department: string | null): Promise<FtOffre[]> {
  const out: FtOffre[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ motsCles, sort: '1', range: `${page * PAGE_SIZE}-${page * PAGE_SIZE + PAGE_SIZE - 1}` });
    if (department) params.set('departement', department);
    // Pas de `origineOffre` : offres France Travail ET partenaires.
    await sleep(THROTTLE_MS);
    const res = await fetch(`${FT_SEARCH_URL}?${params}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (res.status === 204) break;
    if (!res.ok) throw new Error(`search ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const total = Number(res.headers.get('Content-Range')?.match(/\/(\d+)\s*$/)?.[1] ?? NaN);
    const batch = ((await res.json()) as { resultats?: FtOffre[] }).resultats ?? [];
    out.push(...batch);
    if (batch.length < PAGE_SIZE || (Number.isFinite(total) && (page + 1) * PAGE_SIZE >= total)) break;
  }
  return out;
}

type Level = 'certaine' | 'probable' | 'possible';
interface Match { level: Level; ft: FtOffre }

function ftDepartment(o: FtOffre): string | null {
  const lead = o.lieuTravail?.libelle?.match(/^(\d{2,3}|2[AB])\s*-/i)?.[1];
  if (lead) return lead.toUpperCase();
  return departmentOf(o.lieuTravail?.codePostal ?? o.lieuTravail?.libelle ?? null);
}

const RANK: Record<Level, number> = { certaine: 3, probable: 2, possible: 1 };

function bestMatch(apec: ApecOffer, candidates: FtOffre[]): Match | null {
  const title = normalizeTitle(apec.title);
  const company = apec.company ? normalizeCompany(apec.company) : '';
  let best: Match | null = null;
  for (const ft of candidates) {
    if (normalizeTitle(ft.intitule ?? '') !== title) continue;
    const dep = ftDepartment(ft);
    if (apec.department && dep && apec.department !== dep) continue;
    // Sans département des deux côtés, on compare le lieu normalisé (même logique que offer-dedup).
    if (!apec.department || !dep) {
      const a = normalizeLocation(apec.location);
      const b = normalizeLocation(ft.lieuTravail?.libelle ?? null);
      if (a && b && a !== b) continue;
    }
    const ftCompany = ft.entreprise?.nom ? normalizeCompany(ft.entreprise.nom) : '';
    const level: Level = !ftCompany || !company ? 'probable'
      : ftCompany === company || ftCompany.includes(company) || company.includes(ftCompany) ? 'certaine' : 'possible';
    if (!best || RANK[level] > RANK[best.level]) best = { level, ft };
  }
  return best;
}

function partnerOf(o: FtOffre): string {
  const names = (o.origineOffre?.partenaires ?? []).map(p => p.nom?.trim()).filter(Boolean) as string[];
  if (names.length > 0) return names.join(' + ');
  return o.origineOffre?.origine === '2' ? '(partenaire sans nom)' : 'France Travail (direct)';
}

// ── Exécution ────────────────────────────────────────────────────────────────

const offers = loadOffers();
console.log(`\n${offers.length} offre(s) APEC à rechercher.\n`);
if (DEBUG) {
  for (const o of offers) console.log(`• ${o.title}\n    entreprise=${o.company ?? '?'} lieu=${o.location ?? '?'} dép=${o.department ?? '?'}\n    contexte: ${o.context.join(' | ')}`);
}

if (PARSE_ONLY) {
  for (const o of offers) console.log(`- ${o.title} | ${o.company ?? '(entreprise ?)'} | ${o.location ?? '(lieu ?)'} | dép. ${o.department ?? '?'}`);
  process.exit(0);
}

const token = await getToken();
const rows: Array<{ apec: ApecOffer; match: Match | null; queries: string }> = [];
for (const apec of offers) {
  const queries: string[] = [];
  let candidates: FtOffre[] = [];
  const byTitle = keywordsOf(apec.title);
  if (byTitle) {
    queries.push(byTitle);
    candidates = await searchFt(token, byTitle, apec.department);
  }
  let match = bestMatch(apec, candidates);
  if ((!match || match.level === 'possible') && apec.company) {
    const withCompany = keywordsOf(apec.title, apec.company);
    queries.push(withCompany);
    const more = await searchFt(token, withCompany, apec.department);
    const m2 = bestMatch(apec, more);
    if (m2 && (!match || RANK[m2.level] > RANK[match.level])) match = m2;
  }
  rows.push({ apec, match, queries: queries.join(' ⟶ ') });
}

console.log('Offre APEC | trouvée | niveau | partenaire France Travail');
console.log('-'.repeat(100));
for (const { apec, match } of rows) {
  const found = match && match.level !== 'possible';
  console.log(
    `${apec.title.slice(0, 55)} (${apec.company ?? '?'}, ${apec.department ?? '?'}) | ` +
    `${found ? 'oui' : match ? 'peut-être' : 'non'} | ${match?.level ?? '-'} | ${match ? partnerOf(match.ft) : '-'}`,
  );
}

const found = rows.filter(r => r.match && r.match.level !== 'possible');
console.log('\nRésumé');
console.log(`  Offres APEC lues      : ${rows.length}`);
console.log(`  Trouvées (certaine+probable) : ${found.length} (${rows.length ? Math.round((found.length / rows.length) * 100) : 0} %)`);
console.log(`  Possibles (entreprise différente) : ${rows.filter(r => r.match?.level === 'possible').length}`);
const byPartner = new Map<string, number>();
for (const r of found) byPartner.set(partnerOf(r.match!.ft), (byPartner.get(partnerOf(r.match!.ft)) ?? 0) + 1);
for (const [name, n] of [...byPartner].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(3)}  ${name}`);
