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

export type CspVersantValue = Exclude<CspVersant, 'all'>;

/**
 * Le filtre d'URL `versant/<id>/` (2458 FPT, 2456 État, 2457 hospitalière) est
 * IGNORÉ par le site : la même liste revient avec ou sans. Le versant est donc
 * filtré côté client, d'après le champ « Fonction publique » des cartes.
 */

/** `A+` regroupe deux identifiants (4327-4328) : sa syntaxe combinée n'est pas vérifiée, non proposé. */
export const CSP_CATEGORIE_IDS: Record<Exclude<CspCategorie, 'all'>, number> = { A: 1805 };

export interface CspSearch {
  keywords: string;
  /** Identifiant interne du lieu (département ou région), cf. `csp-locations.ts`. */
  locationId?: number | null;
  categorie?: CspCategorie;
  page?: number;
}

/**
 * URL de recherche. Le mot-clé vient toujours en premier : dans l'autre ordre
 * le site répond 404. Le lieu suit (`localisation/<id>/`, identifiant interne
 * et non code de département).
 */
export function buildCspSearchUrl(search: CspSearch): string {
  let path = `/nos-offres/filtres/mot-cles/${encodeURIComponent(search.keywords.trim())}/`;
  if (search.locationId) path += `localisation/${search.locationId}/`;
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
  /** Employeur tel qu'affiché (pour le territorial : une catégorie, « Communes »…). */
  employer: string | null;
  /** Versant lu dans « Fonction publique : … » de la carte. */
  versant: CspVersantValue | null;
  /** « En ligne depuis le … » (ISO, minuit UTC). */
  publishedAt: string | null;
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

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

/** Date ISO (minuit UTC, sans décalage de fuseau) pour un jour/mois/année. */
function utcDay(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 ? d.toISOString() : null;
}

/** « 02 octobre 2026 » → ISO. */
export function parseFrenchLongDate(text: string): string | null {
  const m = /(\d{1,2})\s+([a-zéèêûô]+)\s+(\d{4})/i.exec(text);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
  return month ? utcDay(Number(m[3]), month, Number(m[1])) : null;
}

export function versantFromText(text: string): CspVersantValue | null {
  const m = /Fonction publique\s*:\s*Fonction publique\s+(territoriale|de l.{0,2}[ée]tat|hospitali[èe]re)/i.exec(text);
  if (!m) return null;
  const v = m[1].toLowerCase();
  return v.startsWith('terr') ? 'fpt' : v.startsWith('hosp') ? 'fph' : 'etat';
}

/**
 * Offres d'une page de liste : un lien vers `/offre-emploi/…` par offre. Le
 * reste de la carte (lieu, versant, employeur, date) est lu dans le bloc qui
 * suit le lien, jusqu'à l'offre suivante.
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
    const blockEnd = Math.min(hits[i + 1]?.start ?? html.length, hit.end + 4000);
    const around = stripTags(html.slice(hit.end, blockEnd));
    const labelled = /Localisation\s*:\s*([^\n]+)/.exec(around)?.[1];
    const loc = labelled ? null : LOCATION_RE.exec(around);
    const employer = /Employeur\s*:\s*([^\n]+)/.exec(around)?.[1];
    const since = /En ligne depuis le\s+([^\n]+)/.exec(around)?.[1];
    return {
      url: hit.url,
      title: hit.title,
      location: labelled ? oneLine(labelled) : loc ? `${oneLine(loc[1])} (${loc[2]})` : null,
      employer: employer ? oneLine(employer) : null,
      versant: versantFromText(around),
      publishedAt: since ? parseFrenchLongDate(since) : null,
    };
  });
}

/**
 * Réduit une page de liste (~4,5 Mo de facettes) à son `<title>` et au bloc des
 * cartes d'offre : `parseCspList` y donne le même résultat. Renvoie la page
 * telle quelle si le bloc n'est pas repéré.
 */
export function reduceCspList(html: string): string {
  const first = html.indexOf('<li class="fr-col-12 item">');
  if (first === -1) return html;
  const ulStart = html.lastIndexOf('<ul', first);
  if (ulStart === -1) return html;
  const tag = /<(\/?)ul\b/gi;
  tag.lastIndex = ulStart;
  let depth = 0;
  let end = -1;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) { end = html.indexOf('>', m.index) + 1; break; }
  }
  if (end <= 0) return html;
  const title = /<title>[\s\S]*?<\/title>/i.exec(html)?.[0] ?? '';
  return `<!doctype html>\n<html lang="fr"><head>${title}</head>\n<body>\n${html.slice(ulStart, end)}\n</body></html>\n`;
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
  /** Versant lu dans « Fonction publique : … ». */
  versant: CspVersantValue | null;
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

/**
 * Date ISO (minuit UTC) depuis un texte du site. Le format du site est
 * `jj/mm/aaaa` : `new Date()` le lirait au format américain et décalerait le
 * fuseau. L'ISO (`aaaa-mm-jj…`) reste accepté en repli.
 */
export function parseCspDate(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  const fr = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (fr) return utcDay(Number(fr[3]), Number(fr[2]), Number(fr[1]));
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return utcDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

function locationOf(posting: Json): string | null {
  const raw = posting.jobLocation;
  const loc = (Array.isArray(raw) ? raw[0] : raw) as Json | undefined;
  const address = (loc?.address ?? null) as Json | null;
  if (!address || typeof address !== 'object') return cleanPlace(asString(loc?.name) ?? asString(posting.addressLocality));
  const city = cleanPlace(asString(address.addressLocality));
  const region = cleanPlace(asString(address.addressRegion));
  const postal = asString(address.postalCode);
  const dept = postal && /^\d{5}$/.test(postal)
    ? (postal.startsWith('20') ? (Number(postal) < 20200 ? '2A' : '2B') : postal.startsWith('97') ? postal.slice(0, 3) : postal.slice(0, 2))
    : null;
  if (city && dept && !/\((?:\d{2,3}|2[AB])\)/.test(city)) return `${city} (${dept})`;
  return city ?? region ?? null;
}

/** « Morbihan (56), France » → « Morbihan (56) ». */
function cleanPlace(place: string | null): string | null {
  return place ? place.replace(/,\s*France\s*$/i, '').trim() || null : null;
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

/** Référence portée par l'adresse d'une offre (`…-reference-2026-1234567/`, `…-reference-DEF_15-00064919/`). */
export function referenceFromOfferUrl(url: string): string | null {
  try {
    return /reference-([a-z0-9_-]+?)\/?$/i.exec(new URL(url, CSP_BASE).pathname)?.[1]?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Lien vers l'annonce Emploi Territorial d'origine : dans un `href` ou, comme
 * sur certaines pages, en clair dans le texte (« …sur la page https://… »).
 * Le paramètre de campagne (`pk_campaign`), la requête et l'ancre sont retirés.
 */
export function findOriginalUrl(html: string): string | null {
  const body = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ');
  const m = /https?:\/\/(?:www\.)?emploi-territorial\.fr\/offre\/[^\s"'<>)]+/i.exec(decodeEntities(body));
  if (!m) return null;
  try {
    const u = new URL(m[0].replace(/[.,;:]+$/, ''));
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Détail d'une page d'offre : JSON-LD `JobPosting` d'abord, puis les champs
 * affichés par la page (« Référence », « Fonction publique », « Employeur »,
 * « Date limite »). La page liste aussi des offres similaires plus bas : seule
 * la première occurrence de chaque champ est celle de l'offre.
 *
 * Le JSON-LD du site n'est pas schema.org strict : `hiringOrganization` est une
 * chaîne (une catégorie d'employeur pour le territorial), `Description` porte
 * une majuscule, les dates sont en `jj/mm/aaaa`.
 */
export function parseCspOffer(html: string, pageUrl: string): CspOfferDetail {
  const posting = jobPostings(html)[0] ?? null;
  const originalUrl = findOriginalUrl(html);
  const text = stripTags(html.slice(0, 600_000));

  const org = posting?.hiringOrganization;
  const ldCompany = org && typeof org === 'object' ? asString((org as Json).name) : asString(org);
  const textEmployer = /Employeur\s*:\s*([^\n]+)/.exec(text)?.[1];

  const textRef = /\bR[ée]f[ée]rence\s*:\s*([A-Za-z0-9][A-Za-z0-9_-]{5,})/.exec(text)?.[1] ?? null;
  const reference =
    (posting ? identifierOf(posting) : null)
    ?? textRef
    ?? (originalUrl ? referenceFromEmploiTerritorialUrl(originalUrl) : null)
    ?? referenceFromOfferUrl(pageUrl);

  const textDeadline = /date limite(?: de candidature)?\s*:?\s*(\d{1,2}[/.]\d{1,2}[/.]\d{4})/i.exec(text)?.[1];
  const deadline = parseCspDate(posting?.validThrough) ?? parseCspDate(textDeadline);

  const employment = posting?.employmentType;
  const description = asString(posting?.description) ?? asString(posting?.Description);

  return {
    title: asString(posting?.title),
    company: ldCompany ?? (textEmployer ? oneLine(textEmployer) : null),
    location: posting ? locationOf(posting) : null,
    publishedAt: parseCspDate(posting?.datePosted),
    deadline,
    contractType: Array.isArray(employment) ? asString(employment[0]) : asString(employment),
    // JSON-LD : la description est souvent du HTML échappé (`&lt;p&gt;`).
    description: description ? oneLine(stripTags(/&lt;/.test(description) ? decodeEntities(description) : description)).slice(0, 800) : null,
    reference,
    originalUrl,
    versant: versantFromText(text),
  };
}

// ── Employeur et origine ─────────────────────────────────────────────────────

/**
 * Employeur affiché. Pour le territorial, le site n'affiche qu'une catégorie
 * (« Communes », « Conseils départementaux ») ; l'employeur réel est le suffixe
 * du titre (« … - CONSEIL DÉPARTEMENTAL DU MORBIHAN »). Sans suffixe, on garde
 * ce que le site affiche.
 */
export function employerName(title: string, shown: string | null, versant: CspVersantValue | null): string | null {
  if (versant === 'fpt') {
    const suffix = /\s[-–]\s+([^-–]{3,})$/.exec(title)?.[1]?.trim();
    if (suffix) return suffix;
  }
  return shown;
}

// ── Origine ──────────────────────────────────────────────────────────────────

/**
 * Origine d'une offre relayée. Source la plus fiable : le champ « Fonction
 * publique » de la page (Territoriale → Emploi Territorial ; État ou
 * Hospitalière → Place de l'emploi public). À défaut, une référence `O0…` ou un
 * lien emploi-territorial.fr tient lieu de confirmation.
 */
export function detectOrigin(
  reference: string | null,
  originalUrl: string | null,
  versant: CspVersantValue | null = null,
): OfferOrigin {
  if (versant) return versant === 'fpt' ? 'emploi_territorial' : 'place_emploi_public';
  if (reference && /^O0/i.test(reference.trim())) return 'emploi_territorial';
  if (originalUrl && /^https?:\/\/(?:[a-z0-9-]+\.)*emploi-territorial\.fr(\/|$)/i.test(originalUrl)) return 'emploi_territorial';
  return 'place_emploi_public';
}

export const ORIGIN_LABELS: Record<OfferOrigin, string> = {
  emploi_territorial: 'Emploi Territorial (via Choisir le service public)',
  place_emploi_public: 'Place de l\'emploi public (via Choisir le service public)',
};
