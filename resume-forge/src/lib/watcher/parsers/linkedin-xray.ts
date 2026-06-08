/**
 * LinkedIn parser via l'API publique « jobs-guest » (sans clé, sans session).
 *
 * Pourquoi plus DuckDuckGo HTML ?
 *   L'endpoint X-ray DuckDuckGo (`html.duckduckgo.com/html/`, et son jumeau
 *   `lite.duckduckgo.com/lite/`) renvoie désormais un challenge anti-bot 403
 *   (page Next.js « unfortunately, bots use DuckDuckGo too ») dès qu'une requête
 *   automatisée arrive — que ce soit en GET ou en POST. La recherche X-ray
 *   dépendait donc d'un moteur tiers qui nous bloque : source cassée.
 *
 * Pourquoi l'API « jobs-guest » ?
 *   LinkedIn expose un endpoint public et NON authentifié pour les visiteurs
 *   non connectés :
 *     https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search
 *   Il renvoie directement une liste de cartes d'offres (`<li>`) avec titre,
 *   entreprise, lieu, date et lien `/jobs/view/<id>`. Aucun moteur de recherche
 *   tiers susceptible de nous bannir, et c'est le même domaine `linkedin.com`
 *   que celui déjà interrogé pour l'enrichissement JSON-LD ci-dessous.
 *
 * Pourquoi pas le scraping connecté de LinkedIn ?
 *   LinkedIn interdit explicitement le scraping authentifié dans ses TOS et
 *   bannit les comptes détectés (fingerprint, patterns d'accès, IP). Le risque
 *   pour l'utilisateur est réel et non réversible (perte du compte personnel).
 *   L'API guest, elle, est faite pour les visiteurs anonymes.
 *
 * Approche :
 *   1. Interroger l'API guest avec les mots-clés du profil → cartes d'offres.
 *   2. Construire une offre de base à partir de chaque carte (titre, entreprise,
 *      lieu, date) — fiable même si l'étape 3 échoue.
 *   3. Best-effort : enrichir chaque offre via le JSON-LD `JobPosting` publié sur
 *      la page publique `/jobs/view/<id>` (description, salaire, type de contrat).
 *   4. Si l'enrichissement échoue (rate-limit, page sans JSON-LD), on conserve
 *      l'offre de base : la collecte ne renvoie jamais zéro à cause d'un fetch raté.
 *
 * Aucune session, aucune clé API : le code marche sur desktop comme Android.
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, SearchProfile } from '@/types/job-watch';
import { fetchResilient } from '../http-client';
import { extractJsonLdJobs, type JsonLdJob } from '../json-ld-utils';
import { isExcludedByProfile } from '../profile-to-query';
import { normalizeLocation } from './common/location';
import { extractContractFromText } from './common/contract-type';

/** Endpoint public LinkedIn pour les visiteurs non connectés (pas de clé/session). */
const LINKEDIN_GUEST_JOBS_ENDPOINT =
  'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';

/** Cap dur sur le nombre d'offres traitées par exécution — protège le temps de fetch. */
const MAX_RESULTS_PER_RUN = 20;

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Carte d'offre brute extraite de l'API guest, avant enrichissement JSON-LD. */
interface LinkedinJobCard {
  url:         string;
  title:       string | null;
  company:     string | null;
  location:    string | null;
  publishedAt: string | null;
}

/**
 * Construit la chaîne `keywords` envoyée à l'API guest à partir du profil.
 *
 * Le champ `keywords` de la recherche LinkedIn accepte les opérateurs booléens
 * (`OR`, `AND`, `NOT`, guillemets) comme la barre de recherche du site. On relie
 * donc les intitulés par `OR` pour ne pas sur-contraindre la requête.
 */
export function buildKeywords(profile: SearchProfile): string {
  const titles = profile.jobTitles.map(t => t.trim()).filter(Boolean);
  if (titles.length === 0) return '';
  if (titles.length === 1) return titles[0];
  return titles.map(t => `"${t}"`).join(' OR ');
}

/**
 * Interroge l'API guest LinkedIn et renvoie les cartes d'offres parsées.
 * Lève une erreur sur statut non-2xx (remontée comme erreur de source).
 */
async function searchLinkedinJobs(profile: SearchProfile): Promise<LinkedinJobCard[]> {
  const url = new URL(LINKEDIN_GUEST_JOBS_ENDPOINT);
  const keywords = buildKeywords(profile);
  if (keywords) url.searchParams.set('keywords', keywords);
  url.searchParams.set('location', profile.location.city?.trim() || 'France');
  url.searchParams.set('start', '0');

  const res = await fetchResilient(url.toString(), {
    source: 'linkedin',
    headers: {
      'User-Agent':       DESKTOP_UA,
      'Accept':           'text/html,application/xhtml+xml',
      'Accept-Language':  'fr-FR,fr;q=0.9,en;q=0.8',
    },
    timeoutMs: 15_000,
  });
  if (!res.ok) {
    throw new Error(`LinkedIn jobs-guest API ${res.status}`);
  }
  const html = await res.text();
  return parseLinkedinJobCards(html);
}

/**
 * Parcourt le HTML renvoyé par l'API guest et extrait les cartes d'offres.
 *
 * Chaque offre est un `<li>` contenant un `<div class="base-card"
 * data-entity-urn="urn:li:jobPosting:<id>">` avec titre / entreprise / lieu /
 * date et un lien `a.base-card__full-link` → `/jobs/view/<id>`. On cible d'abord
 * `[data-entity-urn]` (le conteneur d'offre), avec repli sur `li`/`div.base-card`
 * au cas où le markup évolue.
 */
function parseLinkedinJobCards(html: string): LinkedinJobCard[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  let containers = Array.from(doc.querySelectorAll('[data-entity-urn]'));
  if (containers.length === 0) {
    containers = Array.from(doc.querySelectorAll('li, div.base-card'));
  }

  const out: LinkedinJobCard[] = [];
  const seen = new Set<string>();
  for (const el of containers) {
    const link = el.querySelector('a.base-card__full-link, a[href*="/jobs/view/"]');
    const id =
      extractJobId(el.getAttribute('data-entity-urn')) ??
      extractJobId(link?.getAttribute('href'));
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const datetime = el.querySelector('time')?.getAttribute('datetime') ?? null;
    out.push({
      url:         `https://www.linkedin.com/jobs/view/${id}`,
      title:       text(el.querySelector('.base-search-card__title, h3')),
      company:     text(el.querySelector('.base-search-card__subtitle, h4')),
      location:    text(el.querySelector('.job-search-card__location, [class*="location"]')),
      publishedAt: datetime ? safeIso(datetime) : null,
    });
    if (out.length >= MAX_RESULTS_PER_RUN) break;
  }
  return out;
}

/** textContent d'un élément, espaces compactés ; null si vide. */
function text(el: Element | null): string | null {
  const t = el?.textContent?.replace(/\s+/g, ' ').trim();
  return t ? t : null;
}

/**
 * Extrait l'identifiant numérique d'une offre depuis :
 *   - un URN `urn:li:jobPosting:<id>` (attribut `data-entity-urn`), ou
 *   - une URL `/jobs/view/<id>` ou `/jobs/view/<slug>-<id>?…`.
 * Renvoie null si rien d'exploitable.
 */
export function extractJobId(value: string | null | undefined): string | null {
  if (!value) return null;
  const urn = value.match(/jobPosting:(\d+)/);
  if (urn) return urn[1];
  const href = value.match(/\/jobs\/view\/(?:[^/?#]*-)?(\d{4,})(?:[/?#]|$)/);
  return href ? href[1] : null;
}

/** Convertit une date ISO/datetime en ISO string, ou null si invalide. */
function safeIso(datetime: string): string | null {
  const d = new Date(datetime);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Offre de base construite depuis une carte guest (avant enrichissement JSON-LD). */
function cardToRawOffer(card: LinkedinJobCard): RawJobOffer | null {
  if (!card.title) return null;
  const location = card.location ? normalizeLocation(card.location) ?? card.location : null;
  const contractType = extractContractFromText(card.title);
  return {
    source:             'linkedin',
    url:                card.url,
    title:              card.title,
    company:            card.company,
    location,
    contractType,
    descriptionSnippet: null,
    publishedAt:        card.publishedAt,
    salaryMin:          null,
    salaryMax:          null,
    salaryRaw:          null,
    extraction: {
      titleSource:        'html_primary',
      titleConfidence:    'high',
      locationSource:     location ? 'html' : 'none',
      locationConfidence: location ? 'medium' : 'none',
      contractSource:     contractType ? 'regex' : 'none',
      contractConfidence: contractType ? 'low' : 'none',
    },
  };
}

/** Première localisation exploitable d'un JobPosting JSON-LD. */
function extractLocation(job: JsonLdJob): string | null {
  const loc = job.jobLocation;
  if (!loc) return null;
  const first = Array.isArray(loc) ? loc[0] : loc;
  const city = first?.address?.addressLocality?.trim();
  const region = first?.address?.addressRegion?.trim();
  if (city && region) return `${city}, ${region}`;
  return city ?? region ?? null;
}

/** Convertit un JobPosting JSON-LD LinkedIn en RawJobOffer interne. */
function jsonLdToRawOffer(job: JsonLdJob, sourceUrl: string): RawJobOffer | null {
  if (!job.title) return null;
  const company = job.hiringOrganization?.name?.trim() ?? null;
  const rawLocation = extractLocation(job);
  const location = rawLocation ? normalizeLocation(rawLocation) ?? rawLocation : null;
  // employmentType (LinkedIn) : "FULL_TIME", "CONTRACTOR", … → on tente d'abord
  // ce champ ; à défaut, regex sur le titre.
  const contractType =
    mapEmploymentType(job.employmentType) ??
    extractContractFromText(job.title) ??
    null;
  const description = stripHtml(job.description ?? '').slice(0, 1_000);

  const salary = job.baseSalary?.value;
  const salaryMin = salary?.minValue ?? null;
  const salaryMax = salary?.maxValue ?? salary?.value ?? null;
  const salaryRaw = salary
    ? `${salaryMin ?? ''}${salaryMax ? `-${salaryMax}` : ''} ${job.baseSalary?.currency ?? ''}`.trim() || null
    : null;

  return {
    source:             'linkedin',
    url:                sourceUrl,
    title:              job.title.trim(),
    company,
    location,
    contractType,
    descriptionSnippet: description || null,
    publishedAt:        job.datePosted ?? null,
    salaryMin,
    salaryMax,
    salaryRaw,
    extraction: {
      titleSource:        'json_ld',
      titleConfidence:    'high',
      locationSource:     location ? 'json_ld' : 'none',
      locationConfidence: location ? 'high' : 'none',
      contractSource:     contractType ? (job.employmentType ? 'json_ld' : 'regex') : 'none',
      contractConfidence: contractType ? (job.employmentType ? 'high' : 'low') : 'none',
    },
  };
}

function mapEmploymentType(et?: string): string | null {
  if (!et) return null;
  switch (et.toUpperCase()) {
    case 'FULL_TIME':  return 'CDI';
    case 'PART_TIME':  return 'Temps partiel';
    case 'CONTRACTOR': return 'Freelance';
    case 'TEMPORARY':  return 'CDD';
    case 'INTERN':     return 'Stage';
    default:           return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function parseLinkedinXray(
  _config: JobWatchConfig,
  settings: JobWatchSettings,
): Promise<RawJobOffer[]> {
  const profile = settings.searchProfile;
  if (!profile.jobTitles.some(t => t.trim())) {
    // Sans mots-clés, la recherche remonterait n'importe quoi → on s'abstient.
    return [];
  }

  const cards = await searchLinkedinJobs(profile);
  if (cards.length === 0) return [];

  const offers: RawJobOffer[] = [];
  for (const card of cards) {
    // Offre de base depuis la carte : garantit un résultat même si
    // l'enrichissement JSON-LD échoue (rate-limit, page sans JSON-LD).
    let offer = cardToRawOffer(card);

    try {
      const res = await fetchResilient(card.url, {
        source: 'linkedin',
        headers: {
          'User-Agent':       DESKTOP_UA,
          'Accept':           'text/html,application/xhtml+xml',
          'Accept-Language':  'fr-FR,fr;q=0.9,en;q=0.8',
        },
        timeoutMs: 12_000,
      });
      if (res.ok) {
        const html = await res.text();
        for (const j of extractJsonLdJobs(html)) {
          const enriched = jsonLdToRawOffer(j, card.url);
          if (enriched) {
            offer = enriched;
            break;
          }
        }
      }
    } catch (err) {
      // Un enrichissement raté ne doit pas faire perdre l'offre : on garde la carte.
      console.warn('[linkedin] enrichissement JSON-LD échoué', card.url, err);
    }

    if (!offer) continue;
    const filterText = `${offer.title} ${offer.company ?? ''} ${offer.descriptionSnippet ?? ''}`;
    if (isExcludedByProfile(filterText, profile)) continue;
    offers.push(offer);
  }

  return offers;
}
