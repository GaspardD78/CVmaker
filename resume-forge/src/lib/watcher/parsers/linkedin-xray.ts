/**
 * LinkedIn parser via DuckDuckGo HTML X-ray search (no API key).
 *
 * Pourquoi DuckDuckGo HTML ?
 *   Brave Search API n'a plus de plan gratuit (avril 2026 : tout est passé en
 *   abonnement payant « Data for AI »). On retombe sur l'endpoint HTML public
 *   de DuckDuckGo (https://html.duckduckgo.com/html/) qui s'utilise sans clé,
 *   sans JS, et accepte les opérateurs `site:`, `"phrase exacte"`, `OR`.
 *
 * Pourquoi pas le scraping connecté de LinkedIn ?
 *   LinkedIn interdit explicitement le scraping authentifié dans ses TOS et
 *   bannit les comptes détectés (fingerprint, patterns d'accès, IP). Le risque
 *   pour l'utilisateur est réel et non réversible (perte du compte personnel).
 *
 * Approche X-ray :
 *   1. Construire une requête booléenne `site:linkedin.com/jobs/view "..."` qui
 *      restreint DuckDuckGo aux pages d'offres publiques.
 *   2. DuckDuckGo HTML renvoie une page de résultats où chaque lien pointe vers
 *      un redirecteur `//duckduckgo.com/l/?uddg=<URL encodée>` ; on extrait l'URL.
 *   3. Pour chaque URL d'offre publique, on fetch la page LinkedIn ; LinkedIn
 *      y publie un JSON-LD `JobPosting` complet, schema.org standard.
 *
 * Aucune session, aucune clé API : le code marche sur desktop comme Android.
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, SearchProfile } from '@/types/job-watch';
import { fetchResilient } from '../http-client';
import { extractJsonLdJobs, type JsonLdJob } from '../json-ld-utils';
import { isExcludedByProfile } from '../profile-to-query';
import { normalizeLocation } from './common/location';
import { extractContractFromText } from './common/contract-type';

const DDG_HTML_ENDPOINT = 'https://html.duckduckgo.com/html/';

/** Doit matcher uniquement les pages d'offres publiques (pas /jobs/collections/, /jobs/search/, etc.) */
const LINKEDIN_JOB_VIEW_RE = /^https?:\/\/(?:[\w-]+\.)?linkedin\.com\/jobs\/view\/\d+/i;

/** Cap dur sur le nombre d'URLs récupérées par exécution — protège le temps de fetch et évite de stresser DDG. */
const MAX_RESULTS_PER_RUN = 20;

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Construit une requête booléenne X-ray à partir du profil de recherche.
 *
 * Format : `site:linkedin.com/jobs/view ("dev" OR "ingénieur") "Paris"`
 *
 * Pourquoi `site:linkedin.com/jobs/view` plutôt que `site:linkedin.com` ?
 *   - exclut les profils d'utilisateurs (`/in/...`)
 *   - exclut les pages entreprises (`/company/...`)
 *   - exclut les listes paginées (`/jobs/search/...`) qui ne contiennent pas
 *     le JSON-LD JobPosting de l'offre individuelle.
 */
function buildBooleanQuery(profile: SearchProfile): string {
  const titles = profile.jobTitles.map(t => t.trim()).filter(Boolean);
  const city = profile.location.city?.trim();

  const parts: string[] = ['site:linkedin.com/jobs/view'];
  if (titles.length) {
    parts.push(`(${titles.map(t => `"${t}"`).join(' OR ')})`);
  }
  if (city) {
    parts.push(`"${city}"`);
  }
  return parts.join(' ');
}

/**
 * Récupère la liste des URLs d'offres LinkedIn via DuckDuckGo HTML.
 *
 * DuckDuckGo HTML renvoie une page statique avec ~30 résultats par page ; on
 * cap à `MAX_RESULTS_PER_RUN` après dédup. Pas de pagination dans cette
 * version : la fraîcheur prime sur l'exhaustivité.
 */
async function searchDuckDuckGo(query: string): Promise<string[]> {
  const url = new URL(DDG_HTML_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('kl', 'fr-fr');

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
    const body = await res.text().catch(() => '');
    throw new Error(`DuckDuckGo HTML ${res.status} : ${body.slice(0, 200)}`);
  }
  const html = await res.text();
  return extractLinkedinUrlsFromDdgHtml(html);
}

/**
 * Parcourt le DOM de la page DDG HTML et extrait les URLs LinkedIn.
 *
 * DuckDuckGo encadre chaque résultat de :
 *   `<a class="result__a" href="//duckduckgo.com/l/?uddg=<URL encodée>&rut=...">Titre</a>`
 * On déballe `uddg` pour récupérer l'URL réelle. À défaut, certains liens sont
 * directs (`https://www.linkedin.com/...`) — on les accepte aussi.
 */
function extractLinkedinUrlsFromDdgHtml(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const anchors = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>('a.result__a, a.result__url'),
  );
  const collected: string[] = [];
  for (const a of anchors) {
    const href = a.getAttribute('href');
    if (!href) continue;
    const real = unwrapDdgRedirect(href);
    if (real && LINKEDIN_JOB_VIEW_RE.test(real)) {
      collected.push(real);
    }
  }
  // Dédoublonnage par identifiant LinkedIn (id numérique de l'offre).
  const canonical = collected.map(canonicalizeLinkedinUrl);
  return Array.from(new Set(canonical)).slice(0, MAX_RESULTS_PER_RUN);
}

/**
 * Retire la redirection DDG : `//duckduckgo.com/l/?uddg=<encoded>&rut=...`
 * → URL réelle. Renvoie null si l'href n'est pas exploitable.
 */
function unwrapDdgRedirect(href: string): string | null {
  // Liens DDG protocol-relative (`//duckduckgo.com/l/?...`) — ajoute le scheme.
  const normalized = href.startsWith('//') ? `https:${href}` : href;
  try {
    const u = new URL(normalized);
    if ((u.hostname === 'duckduckgo.com' || u.hostname.endsWith('.duckduckgo.com'))
        && u.pathname === '/l/') {
      const target = u.searchParams.get('uddg');
      if (target) return decodeURIComponent(target);
    }
    return u.toString();
  } catch {
    return null;
  }
}

/** Normalise l'URL en `https://www.linkedin.com/jobs/view/<id>` sans paramètres. */
function canonicalizeLinkedinUrl(url: string): string {
  const m = url.match(/\/jobs\/view\/(\d+)/);
  if (!m) return url;
  return `https://www.linkedin.com/jobs/view/${m[1]}`;
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
    // Sans mots-clés, le X-ray remonterait n'importe quoi → on s'abstient.
    return [];
  }

  const query = buildBooleanQuery(profile);
  const urls = await searchDuckDuckGo(query);
  if (urls.length === 0) return [];

  const offers: RawJobOffer[] = [];
  for (const url of urls) {
    try {
      const res = await fetchResilient(url, {
        source: 'linkedin',
        headers: {
          'User-Agent':       DESKTOP_UA,
          'Accept':           'text/html,application/xhtml+xml',
          'Accept-Language':  'fr-FR,fr;q=0.9,en;q=0.8',
        },
        timeoutMs: 12_000,
      });
      if (!res.ok) continue;
      const html = await res.text();
      const jsonLdJobs = extractJsonLdJobs(html);
      for (const j of jsonLdJobs) {
        const offer = jsonLdToRawOffer(j, url);
        if (!offer) continue;
        const filterText = `${offer.title} ${offer.company ?? ''} ${offer.descriptionSnippet ?? ''}`;
        if (isExcludedByProfile(filterText, profile)) continue;
        offers.push(offer);
      }
    } catch (err) {
      // Une URL en échec ne doit pas faire planter toute la collecte.
      console.warn('[linkedin-xray] fetch échoué', url, err);
    }
  }

  return offers;
}
