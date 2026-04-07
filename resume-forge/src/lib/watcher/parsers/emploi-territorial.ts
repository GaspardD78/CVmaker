/**
 * Parser emploi-territorial.fr — Flux RSS/ATOM officiel
 *
 * Le portail de l'emploi public territorial, alimenté directement par les
 * employeurs (communes, intercommunalités, départements, régions, etc.).
 *
 * Intégration : flux RSS/ATOM 2.0
 * URL type : https://www.emploi-territorial.fr/rss/offres-emploi.rss
 *   Paramètres supportés :
 *   - q       : mots-clés
 *   - lieu    : ville ou département
 *   - contrat : CDD, CDI, Fonctionnaire, Contractuel, Stage, Apprentissage
 *
 * Qualité d'extraction :
 *   Titre    : HIGH (champ <title> RSS propre)
 *   Lieu     : MEDIUM (dans le titre ou la description)
 *   Contrat  : MEDIUM (dans le titre ou la description)
 *
 * Note : le flux retourne les N dernières offres publiées.
 * Les mots-clés sont filtrés localement après récupération (pas d'API de recherche).
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, ExtractionMetadata } from '@/types/job-watch';
import { fetchRssFeed, stripHtml, parseDate } from './rss-utils';
import { isExcludedByProfile } from '../profile-to-query';

const ET_RSS_BASE = 'https://www.emploi-territorial.fr/rss/offres-emploi.rss';

/** Collectivité types extracted from title/description */
const COLLECTIVITE_PATTERNS = [
  'Commune', 'Mairie', 'Intercommunalité', 'EPCI', 'Communauté de communes',
  'Communauté d\'agglomération', 'Métropole', 'Conseil départemental', 'Conseil régional',
  'Centre de gestion', 'CNFPT', 'Office public', 'CCAS', 'CIAS',
];

/** Contract type patterns for public sector */
const CONTRACT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bfonctionnaire\b/i,                             label: 'Fonctionnaire' },
  { re: /\btitulaire\b/i,                                 label: 'Fonctionnaire' },
  { re: /\bcontractuel\b/i,                               label: 'CDD' },
  { re: /\bCDI\b/,                                        label: 'CDI' },
  { re: /\bCDD\b/,                                        label: 'CDD' },
  { re: /\bstage\b/i,                                     label: 'Stage' },
  { re: /\bapprentissage\b|\balternance\b/i,               label: 'Alternance' },
];

/** Location patterns: department, region, or city */
const LOCATION_PATTERNS = [
  // "Paris (75)" or "Gironde (33)"
  /([A-ZÀ-Ú][a-zà-ú\s-]+)\s*\((\d{2,3})\)/,
  // "75 - Paris" or "33 - Gironde"
  /(\d{2,3})\s*[-–]\s*([A-ZÀ-Ú][a-zà-ú\s-]+)/,
  // Plain city/department
  /\b(Paris|Lyon|Marseille|Bordeaux|Toulouse|Nantes|Strasbourg|Lille|Rennes|Montpellier)\b/i,
];

function extractContractFromText(text: string): string | null {
  for (const { re, label } of CONTRACT_PATTERNS) {
    if (re.test(text)) return label;
  }
  return null;
}

function extractLocationFromText(text: string): string | null {
  for (const pattern of LOCATION_PATTERNS) {
    const m = pattern.exec(text);
    if (m) {
      // Return matched group depending on pattern
      if (m[2] && /^\d+$/.test(m[2])) return `${m[1].trim()} (${m[2]})`; // "Paris (75)"
      if (m[1] && /^\d+$/.test(m[1])) return `${m[2]?.trim() ?? ''} (${m[1]})`; // "Paris (75)"
      return m[1].trim();
    }
  }
  return null;
}

/** Build the RSS URL with optional keyword/location params */
function buildRssUrl(config: JobWatchConfig, settings: JobWatchSettings): string {
  const profile = settings.searchProfile;
  const params  = new URLSearchParams();

  // Keywords: job titles + skills
  const keywords = [...profile.jobTitles, ...profile.skills].filter(Boolean).join(' ');
  if (keywords) params.set('q', keywords);

  // Location: city or department
  const city = profile.location.city;
  if (city) params.set('lieu', city);

  // Use rssUrl override if provided
  if (config.rssUrl) return config.rssUrl;

  const queryString = params.toString();
  return queryString ? `${ET_RSS_BASE}?${queryString}` : ET_RSS_BASE;
}

export async function parseEmploiTerritorial(
  config: JobWatchConfig,
  settings: JobWatchSettings,
): Promise<RawJobOffer[]> {
  const rssUrl = buildRssUrl(config, settings);
  const profile = settings.searchProfile;

  const items = await fetchRssFeed(rssUrl);

  const offers: RawJobOffer[] = items.map(item => {
    const descText  = stripHtml(item.description, 800) ?? '';
    const fullText  = `${item.title} ${descText}`;

    // Title is clean in emploi-territorial RSS
    const title = item.title.trim();

    // Extract location from title or description
    const locationFromTitle = extractLocationFromText(title);
    const locationFromDesc  = !locationFromTitle ? extractLocationFromText(descText) : null;
    const location          = locationFromTitle ?? locationFromDesc;

    // Extract contract type
    const contractType = extractContractFromText(fullText);

    // Detect collectivité type in description (stored as "company")
    const company = COLLECTIVITE_PATTERNS.find(p => fullText.includes(p)) ?? null;

    const extraction: ExtractionMetadata = {
      titleSource:        'api',   // RSS title is clean structured data
      titleConfidence:    'high',
      locationSource:     location ? (locationFromTitle ? 'html' : 'regex') : 'none',
      locationConfidence: location ? (locationFromTitle ? 'medium' : 'low') : 'none',
      contractSource:     contractType ? 'regex' : 'none',
      contractConfidence: contractType ? 'medium' : 'none',
    };

    return {
      source:             'emploi_territorial',
      url:                item.link,
      title,
      company,
      location,
      contractType,
      descriptionSnippet: descText.slice(0, 500) || null,
      publishedAt:        parseDate(item.pubDate),
      extraction,
    } satisfies RawJobOffer;
  });

  // Apply exclusion filter
  return offers.filter(o => {
    const text = `${o.title} ${o.descriptionSnippet ?? ''}`;
    return !isExcludedByProfile(text, profile);
  });
}
