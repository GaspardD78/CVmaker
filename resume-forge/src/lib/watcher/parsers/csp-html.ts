/**
 * Choisir le service public — lecture du HTML (spec 007, phase 1).
 *
 * Module pur : aucune dépendance réseau ni DOM. La page de liste pèse environ
 * 4,5 Mo (facettes embarquées) : on la parcourt par expressions régulières
 * ciblées plutôt que de construire un arbre DOM complet en mémoire. Elle est
 * lisible sous bun:test, qui n'a pas de DOMParser.
 *
 * ⚠ État de vérification : la structure de la page de liste n'a pas pu être
 * confrontée au vrai site depuis l'environnement de développement (proxy
 * sortant). Seul le JSON-LD `JobPosting` des pages d'offre (norme schema.org)
 * est lu sur un contrat stable ; la liste est lue de façon tolérante (liens
 * vers `/offre-emploi/`). Voir `specs/007-apec-et-recovery/fixtures/README.md`.
 */

import type { CspCategorie, CspVersant, OfferOrigin } from '@/types/job-watch';

export const CSP_HOST = 'choisirleservicepublic.gouv.fr';
export const CSP_BASE = `https://${CSP_HOST}`;

/** Identifiants de filtre du site (constatés par l'utilisateur). */
export const CSP_VERSANT_IDS: Record<Exclude<CspVersant, 'all'>, number> = {
  fpt: 2458,   // Fonction publique territoriale
  etat: 2456,  // Fonction publique de l'État
  fph: 2457,   // Fonction publique hospitalière
};
/** `A+` regroupe deux identifiants (4327-4328) : sa syntaxe combinée n'est pas vérifiée, non proposé. */
export const CSP_CATEGORIE_IDS: Record<Exclude<CspCategorie, 'all'>, number> = { A: 1805 };

export interface CspSearch {
  keywords: string;
  versant?: CspVersant;
  categorie?: CspCategorie;
  page?: number;
}

/**
 * URL de recherche. Le mot-clé vient toujours en premier : dans l'autre ordre
 * le site répond 404.
 */
export function buildCspSearchUrl(search: CspSearch): string {
  let path = `/nos-offres/filtres/mot-cles/${encodeURIComponent(search.keywords.trim())}/`;
  if (search.versant && search.versant !== 'all') path += `versant/${CSP_VERSANT_IDS[search.versant]}/`;
  if (search.categorie && search.categorie !== 'all') path += `categorie/${CSP_CATEGORIE_IDS[search.categorie]}/`;
  if (search.page && search.page > 1) path += `page/${search.page}/`;
  return `${CSP_BASE}${path}`;
}

// ── Utilitaires de texte ─────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç',
  ocirc: 'ô', ucirc: 'û', icirc: 'î', euml: 'ë', iuml: 'ï', rsquo: '’', lsquo: '‘',
  laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', oelig: 'œ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1].toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[ent.toLowerCase()] ?? m;
  });
}

/** HTML → texte brut. Le contenu est une donnée non fiable : jamais réinjecté tel quel. */
export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// ── Page de liste ────────────────────────────────────────────────────────────

export interface CspListItem {
  url: string;
  title: string;
  location: string | null;
}

/** Retire requête et ancre : deux liens vers la même offre ne comptent qu'une fois. */
export function canonicalOfferUrl(href: string): string | null {
  try {
    const u = new URL(href, CSP_BASE);
    if (u.hostname !== CSP_HOST || !/^\/offre-emploi\//.test(u.pathname)) return null;
    return `${CSP_BASE}${u.pathname}`;
  } catch {
    return null;
  }
}

const ANCHOR_RE = /<a\b([^>]*?)\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')([^>]*)>([\s\S]*?)<\/a>/gi;
const LOCATION_RE = /([A-ZÀ-Ú][\wÀ-ÿ'’ -]{1,60}?)\s*\((\d{2,3}|2[AB])\)/;

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? '') : null;
}

/**
 * Offres d'une page de liste : un lien vers `/offre-emploi/…` par offre. Le
 * titre est le texte du lien ; le lieu est cherché dans le bloc qui suit le
 * lien, jusqu'à l'offre suivante (best-effort — le JSON-LD de la page d'offre
 * fait foi quand il est disponible).
 */
export function parseCspList(html: string): CspListItem[] {
  const hits: Array<{ url: string; title: string; start: number; end: number }> = [];
  const seen = new Set<string>();
  ANCHOR_RE.lastIndex = 0;
  for (let m = ANCHOR_RE.exec(html); m; m = ANCHOR_RE.exec(html)) {
    const href = decodeEntities(m[2] ?? m[3] ?? '');
    const url = canonicalOfferUrl(href);
    if (!url || seen.has(url)) continue;
    const attrs = `${m[1]} ${m[4]}`;
    const title = oneLine(stripTags(m[5])) || oneLine(attr(attrs, 'title') ?? attr(attrs, 'aria-label') ?? '');
    if (!title) continue;
    seen.add(url);
    hits.push({ url, title, start: m.index, end: m.index + m[0].length });
  }

  return hits.map((hit, i) => {
    const blockEnd = Math.min(hits[i + 1]?.start ?? html.length, hit.end + 1500);
    const around = stripTags(html.slice(hit.end, blockEnd));
    const loc = LOCATION_RE.exec(around);
    return { url: hit.url, title: hit.title, location: loc ? `${oneLine(loc[1])} (${loc[2]})` : null };
  });
}

/** La page dit explicitement qu'aucune offre ne correspond (≠ page non reconnue). */
export function isEmptyResultPage(html: string): boolean {
  return /aucune offre|aucun résultat|(?:^|\D)0 offre/i.test(stripTags(html.slice(0, 600_000)));
}

// ── Page d'offre ─────────────────────────────────────────────────────────────

export interface CspOfferDetail {
  title: string | null;
  company: string | null;
  location: string | null;
  publishedAt: string | null;
  /** Date limite de candidature (ISO), si publiée. */
  deadline: string | null;
  contractType: string | null;
  description: string | null;
  reference: string | null;
  /** Lien vers l'annonce d'origine (emploi-territorial.fr) quand l'offre est relayée. */
  originalUrl: string | null;
}

type Json = Record<string, unknown>;

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function jobPostings(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      const raw = JSON.parse(m[1].trim()) as unknown;
      const nodes: unknown[] = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as Json)['@graph'])
          ? (raw as Json)['@graph'] as unknown[]
          : [raw];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const type = (node as Json)['@type'];
        if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) out.push(node as Json);
      }
    } catch {
      // bloc JSON-LD illisible : ignoré
    }
  }
  return out;
}

/** Date ISO (jour) depuis un texte JSON-LD ; null si illisible. */
function isoDate(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function locationOf(posting: Json): string | null {
  const raw = posting.jobLocation;
  const loc = (Array.isArray(raw) ? raw[0] : raw) as Json | undefined;
  const address = (loc?.address ?? null) as Json | null;
  if (!address || typeof address !== 'object') return asString(loc?.name);
  const city = asString(address.addressLocality);
  const region = asString(address.addressRegion);
  const postal = asString(address.postalCode);
  const dept = postal && /^\d{5}$/.test(postal)
    ? (postal.startsWith('20') ? (Number(postal) < 20200 ? '2A' : '2B') : postal.startsWith('97') ? postal.slice(0, 3) : postal.slice(0, 2))
    : null;
  if (city && dept) return `${city} (${dept})`;
  return city ?? region ?? null;
}

function identifierOf(posting: Json): string | null {
  const id = posting.identifier;
  if (typeof id === 'string') return asString(id);
  if (id && typeof id === 'object') return asString((id as Json).value) ?? asString((id as Json).name);
  return null;
}

/** Référence ET dans un lien `emploi-territorial.fr/offre/o094261002000713-charge-recrutement`. */
export function referenceFromEmploiTerritorialUrl(url: string): string | null {
  const m = /emploi-territorial\.fr\/offre\/([a-z0-9]+)(?:-|\/|$|\?)/i.exec(url);
  return m ? m[1].toUpperCase() : null;
}

/** Référence portée par l'adresse d'une offre (`…-reference-2026-1234567/`), si elle en porte une. */
export function referenceFromOfferUrl(url: string): string | null {
  try {
    return /reference-([a-z0-9-]+?)\/?$/i.exec(new URL(url, CSP_BASE).pathname)?.[1]?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

export function findOriginalUrl(html: string): string | null {
  const m = /href\s*=\s*["'](https?:\/\/(?:www\.)?emploi-territorial\.fr\/offre\/[^"']+)["']/i.exec(html);
  return m ? decodeEntities(m[1]) : null;
}

/**
 * Détail d'une page d'offre : JSON-LD `JobPosting` d'abord, texte de la page
 * pour la référence et la date limite quand le JSON-LD ne les porte pas.
 */
export function parseCspOffer(html: string, pageUrl: string): CspOfferDetail {
  const posting = jobPostings(html)[0] ?? null;
  const originalUrl = findOriginalUrl(html);
  const text = stripTags(html.slice(0, 600_000));

  const org = posting?.hiringOrganization;
  const company = org && typeof org === 'object' ? asString((org as Json).name) : asString(org);

  const slugRef = referenceFromOfferUrl(pageUrl);
  const textRef = /\bR[ée]f[ée]rence\s*:?\s*([A-Z0-9][A-Z0-9-]{5,})/.exec(text)?.[1] ?? null;
  const reference =
    (posting ? identifierOf(posting) : null)
    ?? (originalUrl ? referenceFromEmploiTerritorialUrl(originalUrl) : null)
    ?? textRef
    ?? slugRef;

  const textDeadline = /date limite(?: de candidature)?\s*:?\s*(\d{1,2})[/.](\d{1,2})[/.](\d{4})/i.exec(text);
  const deadline =
    isoDate(posting?.validThrough)
    ?? (textDeadline ? `${textDeadline[3]}-${textDeadline[2].padStart(2, '0')}-${textDeadline[1].padStart(2, '0')}T00:00:00.000Z` : null);

  const employment = posting?.employmentType;
  const description = asString(posting?.description);

  return {
    title: asString(posting?.title),
    company,
    location: posting ? locationOf(posting) : null,
    publishedAt: isoDate(posting?.datePosted),
    deadline,
    contractType: Array.isArray(employment) ? asString(employment[0]) : asString(employment),
    // JSON-LD : la description est souvent du HTML échappé (`&lt;p&gt;`).
    description: description ? oneLine(stripTags(/&lt;/.test(description) ? decodeEntities(description) : description)).slice(0, 800) : null,
    reference,
    originalUrl,
  };
}

// ── Origine ──────────────────────────────────────────────────────────────────

/**
 * Origine d'une offre relayée : `O0…` ou lien emploi-territorial.fr → Emploi
 * Territorial ; sinon Place de l'emploi public (références `2026-…`).
 */
export function detectOrigin(reference: string | null, originalUrl: string | null): OfferOrigin {
  if (reference && /^O0/i.test(reference.trim())) return 'emploi_territorial';
  if (originalUrl && /(^|\/\/|\.)emploi-territorial\.fr(\/|$)/i.test(originalUrl)) return 'emploi_territorial';
  return 'place_emploi_public';
}

export const ORIGIN_LABELS: Record<OfferOrigin, string> = {
  emploi_territorial: 'Emploi Territorial (via Choisir le service public)',
  place_emploi_public: 'Place de l\'emploi public (via Choisir le service public)',
};
