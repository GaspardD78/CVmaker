/**
 * Choisir le service public — collecte (spec 007, phase 1).
 *
 * Site officiel de l'emploi public (DGAFP). Il relaie notamment les offres
 * d'Emploi Territorial, dont le flux RSS direct est fermé : c'est le canal
 * automatique et légitime pour la fonction publique territoriale.
 *
 * Politesse (non négociable) :
 *   - User-Agent honnête `ResumeForge/<version> (veille emploi personnelle)` ;
 *   - une requête par seconde au plus, toutes requêtes confondues ;
 *   - 3 pages au plus par intitulé et par collecte ;
 *   - arrêt dès qu'une page ne contient que des offres déjà connues ;
 *   - robots.txt respecté ;
 *   - aucun retry sur 403/429 : si le site refuse, on s'arrête et on l'affiche.
 * Aucune protection anti-robot n'est contournée.
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, SearchProfile } from '@/types/job-watch';
import pkg from '../../../../package.json';
import { tauriFetch } from '../http';
import { frenchJobTitles, NO_FRENCH_TITLE_MESSAGE } from '../french-titles';
import { isExcludedByProfile } from '../profile-to-query';
import { looksLikeBlockPage, SourceError } from '../source-status';
import { normalizeLocation } from './common/location';
import {
  CSP_BASE, CSP_HOST, buildCspSearchUrl, detectOrigin, resolveEmployer, isEmptyResultPage,
  parseCspList, parseCspOffer, referenceFromOfferUrl,
  type CspListItem, type CspOfferDetail, type CspVersantValue,
} from './csp-html';
import { resolveCspLocationIds } from './csp-locations';
import { searchTermsForAll, titleMatches } from './csp-relevance';

export const CSP_USER_AGENT = `ResumeForge/${pkg.version} (veille emploi personnelle)`;
export const CSP_MIN_INTERVAL_MS = 1000;
export const CSP_MAX_PAGES = 3;
/** Plafond d'enrichissements (une requête par offre nouvelle) par collecte. */
export const CSP_MAX_ENRICH = 40;
const MAX_TITLES = 5;
const MAX_REDIRECTS = 3;

/** Chemins interdits par le robots.txt constaté (repli si le fichier est illisible). */
const FALLBACK_DISALLOW = ['/wp-admin/', '/wp-content/uploads/pdf-offers/'];

// ── Dépendances injectables ──────────────────────────────────────────────────

export interface CspDeps {
  /** Requête HTTP sans suivi automatique des redirections. */
  http: (url: string, init: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** URL d'offres déjà en base pour cette source. */
  knownUrls: () => Promise<Set<string>>;
}

async function loadKnownUrls(): Promise<Set<string>> {
  try {
    const { getDb } = await import('../../db');
    const db = await getDb();
    const rows = await db.select<{ url: string }[]>(
      `SELECT url FROM job_offers WHERE source = 'choisir_service_public'`,
    );
    return new Set(rows.map(r => r.url));
  } catch {
    return new Set();
  }
}

export const DEFAULT_CSP_DEPS: CspDeps = {
  http: (url, init) => tauriFetch(url, { ...init, maxRedirections: 0 } as RequestInit),
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  now: () => Date.now(),
  knownUrls: loadKnownUrls,
};

// ── Politesse : cadence et robots.txt ────────────────────────────────────────

/** Cadence partagée par toutes les requêtes vers le site, d'une collecte à l'autre. */
let lastRequestAt = 0;

export function __resetCspStateForTests(): void {
  lastRequestAt = 0;
  robotsCache = null;
}

async function politeRequest(url: string, deps: CspDeps): Promise<Response> {
  const wait = lastRequestAt + CSP_MIN_INTERVAL_MS - deps.now();
  if (wait > 0) await deps.sleep(wait);
  lastRequestAt = deps.now();
  return deps.http(url, {
    method: 'GET',
    headers: {
      'User-Agent': CSP_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    },
  });
}

/** Règles `Disallow` applicables à `User-agent: *`. */
export function parseRobotsDisallow(robots: string): string[] {
  const rules: string[] = [];
  let applies = false;
  let inAgentBlock = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    const k = key.trim().toLowerCase();
    if (k === 'user-agent') {
      if (!inAgentBlock) applies = false;
      inAgentBlock = true;
      if (value === '*') applies = true;
    } else {
      inAgentBlock = false;
      if (applies && k === 'disallow' && value) rules.push(value);
    }
  }
  return rules;
}

export function isAllowedByRobots(url: string, disallow: string[]): boolean {
  let path: string;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    return false;
  }
  return !disallow.some(rule => path.startsWith(rule.replace(/\*$/, '')));
}

const ROBOTS_TTL_MS = 24 * 3_600_000;
let robotsCache: { rules: string[]; at: number } | null = null;

async function loadRobotsRules(deps: CspDeps): Promise<string[]> {
  if (robotsCache && deps.now() - robotsCache.at < ROBOTS_TTL_MS) return robotsCache.rules;
  let rules = FALLBACK_DISALLOW;
  try {
    const res = await politeRequest(`${CSP_BASE}/robots.txt`, deps);
    if (res.status === 200) {
      const parsed = parseRobotsDisallow(await res.text());
      if (parsed.length > 0) rules = parsed;
    }
  } catch {
    // robots.txt illisible : on applique les règles constatées
  }
  robotsCache = { rules, at: deps.now() };
  return rules;
}

// ── Requêtes avec redirections 302 ───────────────────────────────────────────

function assertOk(res: Response, url: string): void {
  if (res.status === 403 || res.status === 429) {
    throw new SourceError('bloquee', `Choisir le service public refuse la requête (HTTP ${res.status})`, {
      httpStatus: res.status, url,
    });
  }
  if (res.status === 404 || res.status === 410) {
    throw new SourceError('introuvable', `Page introuvable (HTTP ${res.status})`, { httpStatus: res.status, url });
  }
  if (res.status >= 400) {
    throw new SourceError('erreur_reseau', `Choisir le service public HTTP ${res.status}`, { httpStatus: res.status, url });
  }
}

/** GET qui suit les redirections 301/302/303/307/308 en restant sur le site, à la cadence polie. */
export async function getHtml(url: string, deps: CspDeps, rules: string[]): Promise<string> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedByRobots(current, rules)) {
      throw new SourceError('bloquee', 'robots.txt interdit cette adresse', { url: current });
    }
    const res = await politeRequest(current, deps);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new SourceError('reponse_invalide', 'Redirection sans destination', { httpStatus: res.status, url: current });
      const next = new URL(location, current);
      // Une redirection vers un autre domaine n'est pas suivie.
      if (next.hostname !== CSP_HOST) {
        throw new SourceError('reponse_invalide', `Redirection hors du site (${next.hostname})`, { httpStatus: res.status, url: current });
      }
      current = next.toString();
      continue;
    }
    assertOk(res, current);
    const body = await res.text();
    if (looksLikeBlockPage(body)) {
      throw new SourceError('bloquee', 'Contrôle anti-robot affiché par le site', { httpStatus: res.status, url: current });
    }
    return body;
  }
  throw new SourceError('reponse_invalide', 'Trop de redirections', { url });
}

// ── Construction des offres ──────────────────────────────────────────────────

function locationMatches(location: string, depts: Set<string>, city: string | null): boolean {
  if (city) {
    const re = new RegExp('\\b' + city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(location)) return true;
  }
  const code = /\((\d{2,3}|2[AB])\)/.exec(location)?.[1];
  if (code && (depts.has(code) || (code.length === 3 && depts.has(code.slice(0, 2))))) return true;
  return false;
}

export function buildCspOffer(item: CspListItem, detail: CspOfferDetail | null): RawJobOffer {
  const reference = detail?.reference ?? referenceFromOfferUrl(item.url);
  // Le versant affiché par le site (page d'offre, sinon carte de la liste) fait
  // foi ; sans lui, une référence O0… confirme Emploi Territorial, sinon rien.
  const versant = detail?.versant ?? item.versant;
  const origin = versant || detail
    ? detectOrigin(reference, detail?.originalUrl ?? null, versant)
    : reference && /^O0/i.test(reference) ? 'emploi_territorial' : null;
  const title = detail?.title ?? item.title;
  const { company, employerType } = resolveEmployer(title, detail?.company ?? item.employer, versant);
  const location = normalizeLocation(detail?.location ?? item.location);
  const deadline = detail?.deadline ? `Date limite de candidature : ${detail.deadline.slice(0, 10)}. ` : '';
  const snippet = `${deadline}${detail?.description ?? ''}`.trim();

  return {
    source: 'choisir_service_public',
    url: item.url,
    title,
    company,
    employerType,
    location,
    contractType: detail?.contractType ?? null,
    descriptionSnippet: snippet ? snippet.slice(0, 500) : null,
    publishedAt: detail?.publishedAt ?? item.publishedAt,
    origin,
    reference,
    extraction: {
      titleSource: detail?.title ? 'json_ld' : 'html_primary',
      titleConfidence: detail?.title ? 'high' : 'medium',
      locationSource: location ? (detail?.location ? 'json_ld' : 'html') : 'none',
      locationConfidence: location ? (detail?.location ? 'high' : 'medium') : 'none',
      contractSource: detail?.contractType ? 'json_ld' : 'none',
      contractConfidence: detail?.contractType ? 'medium' : 'none',
    },
  };
}

/** Versant de la piste : `all` ou absent n'écarte rien ; un versant inconnu de la carte n'écarte pas non plus. */
export function versantWanted(wanted: CspVersantValue | 'all' | undefined, seen: CspVersantValue | null): boolean {
  return !wanted || wanted === 'all' || !seen || seen === wanted;
}

// ── Point d'entrée ───────────────────────────────────────────────────────────

/** Mesure d'une collecte (journal de collecte, spec 007). */
export interface CspMetrics {
  /** Offres distinctes listées par les pages lues. */
  listed: number;
  /** Offres retenues par le post-filtre (versant, titre, exclusions, lieu), avant enrichissement. */
  retained: number;
  /** Pages d'offre demandées pour enrichissement. */
  enriched: number;
  /** Pages de liste demandées. */
  listPages: number;
  durationMs: number;
}

let lastMetrics: CspMetrics | null = null;

/** Mesure de la dernière collecte, une seule fois (lue par le pipeline après `parseChoisirServicePublic`). */
export function consumeCspMetrics(): CspMetrics | null {
  const m = lastMetrics;
  lastMetrics = null;
  return m;
}

export async function parseChoisirServicePublic(
  _config: JobWatchConfig,
  _settings: JobWatchSettings,
  profile: SearchProfile,
  deps: CspDeps = DEFAULT_CSP_DEPS,
): Promise<RawJobOffer[]> {
  lastMetrics = null;
  const startedAt = deps.now();
  const titles = frenchJobTitles(profile.jobTitles).slice(0, MAX_TITLES);
  if (titles.length === 0) throw new SourceError('intitules_inadaptes', NO_FRENCH_TITLE_MESSAGE);

  const rules = await loadRobotsRules(deps);
  const known = await deps.knownUrls();

  // Le site ne fait pas de recherche exacte : on interroge chaque intitulé ET son mot le
  // plus discriminant (2 requêtes au plus par intitulé et par lieu), puis on filtre.
  const terms = searchTermsForAll(titles);

  // Lieux interrogés : identifiant interne du département ou de la région (un seul
  // « sans filtre » quand le lieu n'est pas reconnu : le post-filtre client reste actif).
  const locationIds: Array<number | null> = resolveCspLocationIds({
    departmentCodes: profile.location.departmentCodes,
    city: profile.location.city,
    radiusKm: profile.location.radiusKm,
  });
  if (locationIds.length === 0) locationIds.push(null);

  const expectedDepts = new Set(profile.location.departmentCodes.map(c => c.trim()).filter(Boolean));
  const expectedCity = profile.location.city?.trim() || null;

  /**
   * Post-filtre sur la carte, avant tout enrichissement : versant, titre porteur d'un
   * intitulé de la piste, exclusions du profil, lieu connu dans la zone.
   */
  const passes = (item: CspListItem): boolean =>
    versantWanted(profile.cspVersant, item.versant)
    && titleMatches(item.title, profile.jobTitles)
    && !isExcludedByProfile(item.title, profile)
    && !((expectedDepts.size > 0 || expectedCity) && item.location
      && !locationMatches(item.location, expectedDepts, expectedCity));

  // Liste : par requête et par lieu, 3 pages au plus, arrêt sur page sans offre retenue
  // ou entièrement connue.
  const fresh = new Map<string, CspListItem>();
  // Offres déjà en base revues dans les pages lues : renvoyées sans enrichissement
  // (aucune requête) pour que le pipeline les rattache aux pistes concernées.
  const revisited = new Map<string, CspListItem>();
  const listed = new Set<string>();
  let listPages = 0;
  for (const keywords of terms) {
    for (const locationId of locationIds) {
      for (let page = 1; page <= CSP_MAX_PAGES; page++) {
        const url = buildCspSearchUrl({ keywords, locationId, categorie: profile.cspCategorie, page });
        let html: string;
        try {
          listPages += 1;
          html = await getHtml(url, deps, rules);
        } catch (err) {
          // Au-delà de la première page, un 404 marque la fin des résultats.
          if (page > 1 && err instanceof SourceError && err.kind === 'introuvable') break;
          throw err;
        }
        const items = parseCspList(html);
        if (items.length === 0) {
          if (page === 1 && !isEmptyResultPage(html)) {
            throw new SourceError(
              'reponse_invalide',
              'Page de résultats non reconnue (aucune offre repérée) : la structure du site a probablement changé',
              { httpStatus: 200, url },
            );
          }
          break;
        }
        for (const item of items) listed.add(item.url);
        const relevant = items.filter(passes);
        let unseen = 0;
        for (const item of relevant) {
          if (known.has(item.url)) { revisited.set(item.url, item); continue; }
          unseen += 1;
          if (!fresh.has(item.url)) fresh.set(item.url, item);
        }
        // Plus aucune offre pertinente sur cette page (le site classe mal : la suite sera
        // pire), ou rien que de déjà connu : inutile d'aller plus loin.
        if (relevant.length === 0 || unseen === 0) break;
      }
    }
  }

  // Enrichissement best-effort par le JSON-LD, des seules offres retenues.
  const offers: RawJobOffer[] = [];
  let enriched = 0;
  let enrichmentStopped = false;
  for (const item of fresh.values()) {
    let detail: CspOfferDetail | null = null;
    if (!enrichmentStopped && enriched < CSP_MAX_ENRICH) {
      enriched += 1;
      try {
        detail = parseCspOffer(await getHtml(item.url, deps, rules), item.url);
      } catch (err) {
        // Un refus ou un blocage arrête les enrichissements (on ne martèle pas) ;
        // l'offre de base est conservée dans tous les cas.
        if (err instanceof SourceError && err.kind === 'bloquee') enrichmentStopped = true;
        console.debug(`[choisir-service-public] enrichissement ignoré (${item.url}):`, err);
      }
    }
    // Versant lu sur la page d'offre (plus fiable que la carte) : on écarte après coup.
    if (detail?.versant && !versantWanted(profile.cspVersant, detail.versant)) continue;
    offers.push(buildCspOffer(item, detail));
  }

  for (const item of revisited.values()) offers.push(buildCspOffer(item, null));

  const result = offers.filter(o => {
    if (isExcludedByProfile(`${o.title} ${o.descriptionSnippet ?? ''}`, profile)) return false;
    // Lieu inconnu : on garde (impossible de trancher) ; lieu connu hors zone : on écarte.
    if ((expectedDepts.size > 0 || expectedCity) && o.location) {
      return locationMatches(o.location, expectedDepts, expectedCity);
    }
    return true;
  });

  lastMetrics = {
    listed: listed.size,
    retained: fresh.size + revisited.size,
    enriched,
    listPages,
    durationMs: deps.now() - startedAt,
  };
  return result;
}
