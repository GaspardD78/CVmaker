/**
 * Parser LinkedIn via flux RSS tiers (rss.app, jobicy, ou autre).
 *
 * LinkedIn bloque le scraping direct. L'utilisateur fournit une URL RSS
 * générée par un service tiers. Stockée dans job_watch_config.rss_url.
 *
 * Qualité d'extraction :
 *   Titre   : MEDIUM (parsé depuis le titre RSS "Job at Company in Location")
 *   Lieu    : LOW (regex sur le titre/description)
 *   Contrat : LOW (regex sur la description)
 *
 * Améliorations v2 :
 *   - Extraction multi-patterns du titre/entreprise/lieu
 *   - Détection lieu via patterns géographiques communs
 *   - Extraction salaire depuis la description
 *   - Métadonnées d'extraction ExtractionMetadata
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, ExtractionMetadata } from '@/types/job-watch';
import { fetchRssFeed, stripHtml, parseDate } from './rss-utils';
import { tauriFetch, BROWSER_USER_AGENT } from '../http';
import { extractJsonLdJobs, parseJobLocation, parseJobDate } from '../json-ld-utils';

// ── Patterns d'extraction ────────────────────────────────────────────────────

/** "Software Engineer at Google" or "Développeur React chez Startup" */
const TITLE_AT_COMPANY = /^(.+?)\s+(?:at|chez|@)\s+(.+?)(?:\s*(?:in|à|dans)\s+(.+?))?$/i;

/** "Software Engineer - Google - Paris" */
const TITLE_DASH_COMPANY = /^(.+?)\s+-\s+(.+?)(?:\s+-\s+(.+))?$/;

/** "Développeur | TechCorp | Île-de-France" */
const TITLE_PIPE_COMPANY = /^(.+?)\s+\|\s+(.+?)(?:\s+\|\s+(.+))?$/;

/** Detect French department (75, 78...) or commune in parentheses: "(75)" or "(Île-de-France)" */
const LOCATION_PARENTHESIS = /\(([^)]+)\)\s*$/;

/** Common location patterns in job descriptions */
const LOCATION_PATTERNS = [
  /\b(Paris|Lyon|Marseille|Bordeaux|Toulouse|Nantes|Strasbourg|Lille|Rennes|Montpellier|Nice|Grenoble|Dijon|Rouen)\b/i,
  /\b(Île[- ]de[- ]France|IDF|Hauts[- ]de[- ]Seine|Seine[- ]Saint[- ]Denis|Val[- ]de[- ]Marne)\b/i,
  /\b(\d{5})\b/, // postal code
];

/** Contract type patterns in description */
const CONTRACT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bCDI\b/,                                                         label: 'CDI' },
  { re: /\bCDD\b/,                                                         label: 'CDD' },
  { re: /\bFreelance\b/i,                                                  label: 'Freelance' },
  { re: /\bAlternance\b|\bApprentissage\b/i,                               label: 'Alternance' },
  { re: /\bStage\b|\bInternship\b/i,                                       label: 'Stage' },
  { re: /\bIntérim\b|\bInterim\b/i,                                        label: 'Intérim' },
  { re: /\bFull[- ]?time\b/i,                                              label: 'CDI' },
  { re: /\bPart[- ]?time\b/i,                                              label: 'CDD' },
  { re: /\bContractor\b|\bContract\b/i,                                    label: 'Freelance' },
];

/** Salary patterns in description (annual or monthly) */
const SALARY_PATTERNS = [
  // "45 000 € - 55 000 €" or "45k - 55k"
  /(\d[\d\s]*(?:k|000))\s*€?\s*[-–à]\s*(\d[\d\s]*(?:k|000))\s*€?/i,
  // "45 000 €"
  /(\d[\d\s]*)\s*€\s*(?:brut|annuel|an|\/an)?/i,
];

// ── Extraction helpers ────────────────────────────────────────────────────────

interface ParsedTitle {
  title:    string;
  company:  string | null;
  location: string | null;
  titleConfidence: 'medium' | 'low';
}

function parseTitleString(raw: string): ParsedTitle {
  // Try "Title at Company in Location"
  const atMatch = TITLE_AT_COMPANY.exec(raw);
  if (atMatch) {
    return {
      title:           atMatch[1].trim(),
      company:         atMatch[2].trim() || null,
      location:        atMatch[3]?.trim() || null,
      titleConfidence: 'medium',
    };
  }

  // Try "Title | Company | Location"
  const pipeMatch = TITLE_PIPE_COMPANY.exec(raw);
  if (pipeMatch) {
    return {
      title:           pipeMatch[1].trim(),
      company:         pipeMatch[2].trim() || null,
      location:        pipeMatch[3]?.trim() || null,
      titleConfidence: 'medium',
    };
  }

  // Try "Title - Company - Location"
  const dashMatch = TITLE_DASH_COMPANY.exec(raw);
  if (dashMatch) {
    return {
      title:           dashMatch[1].trim(),
      company:         dashMatch[2].trim() || null,
      location:        dashMatch[3]?.trim() || null,
      titleConfidence: 'medium',
    };
  }

  // Fallback: use whole string as title
  return {
    title:           raw.trim(),
    company:         null,
    location:        null,
    titleConfidence: 'low',
  };
}

function extractLocationFromText(text: string): { location: string | null; confidence: 'medium' | 'low' | 'none' } {
  // Location in parentheses at end of title is reliable
  const parenMatch = LOCATION_PARENTHESIS.exec(text);
  if (parenMatch) return { location: parenMatch[1].trim(), confidence: 'medium' };

  // City name patterns
  for (const pattern of LOCATION_PATTERNS) {
    const m = pattern.exec(text);
    if (m) return { location: m[1].trim(), confidence: 'low' };
  }

  return { location: null, confidence: 'none' };
}

function extractContractFromText(text: string): { contract: string | null; confidence: 'medium' | 'low' | 'none' } {
  for (const { re, label } of CONTRACT_PATTERNS) {
    if (re.test(text)) return { contract: label, confidence: 'low' };
  }
  return { contract: null, confidence: 'none' };
}

function extractSalaryFromText(text: string): { min: number | null; max: number | null; raw: string | null } {
  for (const pat of SALARY_PATTERNS) {
    const m = pat.exec(text);
    if (m) {
      const parseAmount = (s: string): number => {
        const cleaned = s.replace(/\s/g, '');
        const v = parseFloat(cleaned.replace(/k$/i, ''));
        return cleaned.toLowerCase().endsWith('k') ? v * 1000 : v;
      };
      const min = parseAmount(m[1]);
      const max = m[2] ? parseAmount(m[2]) : min;
      if (min >= 10_000 && min <= 500_000) {
        return { min, max, raw: m[0].trim() };
      }
    }
  }
  return { min: null, max: null, raw: null };
}

// ── Scraping LinkedIn sans RSS ────────────────────────────────────────────────

export const LINKEDIN_SCRAPING_ERROR_MESSAGE =
  "Scraping LinkedIn échoué — essayez rss.app comme alternative.";

const LINKEDIN_GUEST_API_URL =
  'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';

async function scrapeLinkedinJobs(settings: JobWatchSettings): Promise<RawJobOffer[]> {
  const profile  = settings.searchProfile;
  const keywords = profile.jobTitles.slice(0, 3).join(' ');

  const params = new URLSearchParams();
  if (keywords) params.set('keywords', keywords);
  params.set('location', 'France');
  params.set('start', '0');

  const url = `${LINKEDIN_GUEST_API_URL}?${params.toString()}`;

  let html: string;
  try {
    const res = await tauriFetch(url, {
      headers: {
        'User-Agent':      BROWSER_USER_AGENT,
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch {
    throw new Error(LINKEDIN_SCRAPING_ERROR_MESSAGE);
  }

  // Strategy 1: JSON-LD structured data (HIGH confidence)
  const jsonLdJobs = extractJsonLdJobs(html);
  if (jsonLdJobs.length > 0) {
    return jsonLdJobs.map(job => {
      const city = parseJobLocation(job);
      return {
        source:             'linkedin_rss',
        url:                job.url ?? url,
        title:              job.title!,
        company:            job.hiringOrganization?.name ?? null,
        location:           city,
        contractType:       null,
        descriptionSnippet: job.description ? stripHtml(job.description, 500) : null,
        publishedAt:        parseJobDate(job),
        salaryMin:          null,
        salaryMax:          null,
        salaryRaw:          null,
        extraction: {
          titleSource:        'json_ld',
          titleConfidence:    'high',
          locationSource:     city ? 'json_ld' : 'none',
          locationConfidence: city ? 'medium' : 'none',
          contractSource:     'none',
          contractConfidence: 'none',
        },
      } satisfies RawJobOffer;
    });
  }

  // Strategy 2: CSS fallback [data-job-id]
  const parser  = new DOMParser();
  const doc     = parser.parseFromString(html, 'text/html');
  const cards   = Array.from(doc.querySelectorAll('[data-job-id]'));

  const offers: RawJobOffer[] = cards
    .map(card => {
      const titleEl   = card.querySelector('h3, .base-search-card__title');
      const companyEl = card.querySelector('h4, .base-search-card__subtitle');
      const locEl     = card.querySelector('.job-search-card__location, [class*="location"]');
      const linkEl    = card.querySelector('a[href*="/jobs/view/"]');

      const href   = linkEl?.getAttribute('href') ?? '';
      const jobUrl = href.startsWith('http') ? href : (href ? `https://www.linkedin.com${href}` : url);

      return {
        source:             'linkedin_rss',
        url:                jobUrl,
        title:              titleEl?.textContent?.trim() ?? '',
        company:            companyEl?.textContent?.trim() ?? null,
        location:           locEl?.textContent?.trim() ?? null,
        contractType:       null,
        descriptionSnippet: null,
        publishedAt:        null,
        salaryMin:          null,
        salaryMax:          null,
        salaryRaw:          null,
        extraction: {
          titleSource:        'html_primary',
          titleConfidence:    'medium',
          locationSource:     locEl ? 'html' : 'none',
          locationConfidence: locEl ? 'low' : 'none',
          contractSource:     'none',
          contractConfidence: 'none',
        },
      } satisfies RawJobOffer;
    })
    .filter(o => o.title.length > 0);

  if (offers.length === 0) {
    throw new Error(LINKEDIN_SCRAPING_ERROR_MESSAGE);
  }

  return offers;
}

// ── Main parser ──────────────────────────────────────────────────────────────

export async function parseLinkedinRss(
  config: JobWatchConfig,
  settings?: JobWatchSettings,
): Promise<RawJobOffer[]> {
  if (!config.rssUrl) {
    if (!settings) {
      console.warn('[linkedin_rss] Pas de settings fournis pour le scraping — ignoré');
      return [];
    }
    return scrapeLinkedinJobs(settings);
  }

  const items = await fetchRssFeed(config.rssUrl);

  return items.map(item => {
    const descText = stripHtml(item.description, 1000) ?? '';
    const fullText = `${item.title} ${descText}`;

    // Parse title string into structured fields
    const parsed = parseTitleString(item.title);

    // Refine location: use parsed location, or search in description
    let location     = parsed.location;
    let locConfidence: 'high' | 'medium' | 'low' | 'none' = location ? 'medium' : 'none';

    if (!location) {
      const fromDesc = extractLocationFromText(fullText);
      location       = fromDesc.location;
      locConfidence  = fromDesc.confidence === 'none' ? 'none' : fromDesc.confidence;
    }

    // Contract type
    const contractResult = extractContractFromText(fullText);

    // Salary
    const { min: salaryMin, max: salaryMax, raw: salaryRaw } = extractSalaryFromText(descText);

    const extraction: ExtractionMetadata = {
      titleSource:        'regex',
      titleConfidence:    parsed.titleConfidence,
      locationSource:     location ? 'regex' : 'none',
      locationConfidence: locConfidence as 'high' | 'medium' | 'low' | 'none',
      contractSource:     contractResult.contract ? 'regex' : 'none',
      contractConfidence: contractResult.confidence === 'none'
        ? 'none'
        : contractResult.confidence,
    };

    return {
      source:             'linkedin_rss',
      url:                item.link,
      title:              parsed.title,
      company:            parsed.company,
      location,
      contractType:       contractResult.contract,
      descriptionSnippet: descText.slice(0, 500) || null,
      publishedAt:        parseDate(item.pubDate),
      salaryMin:          salaryMin,
      salaryMax:          salaryMax,
      salaryRaw:          salaryRaw,
      extraction,
    } satisfies RawJobOffer;
  });
}
