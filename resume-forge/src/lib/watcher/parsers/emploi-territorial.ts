/**
 * Parser emploi-territorial.fr — Flux RSS/ATOM officiel
 *
 * Le portail de l'emploi public territorial, alimenté directement par les
 * employeurs (communes, intercommunalités, départements, régions, etc.).
 *
 * Intégration : flux RSS/ATOM 2.0
 * URL type : https://www.emploi-territorial.fr/rss/offres-emploi.rss
 *   Paramètres GET observés (filtre côté serveur best-effort, pas garanti) :
 *   - q       : mots-clés (FAQ : phrase exacte avec `"..."`, `or` minuscule entre alternatives)
 *   - lieu    : ville ou département
 *   - contrat : CDD, CDI, Fonctionnaire, Contractuel, Stage, Apprentissage
 *
 * NB : la doc publique est très lacunaire (le site bloque les inspections
 * automatisées). On part du principe que `q` et `lieu` réduisent le dataset
 * mais ne le filtrent pas strictement, et on applique un **post-filter strict**
 * côté client pour la précision.
 *
 * Qualité d'extraction :
 *   Titre    : HIGH (champ <title> RSS propre)
 *   Lieu     : MEDIUM (dans le titre ou la description)
 *   Contrat  : MEDIUM (dans le titre ou la description)
 *
 * Une API JSON officielle existe sur https://www.emploi-territorial.fr/api/
 * (référencée sur data.gouv.fr) — meilleure piste pour le rappel à terme,
 * mais sa doc publique est inaccessible aux fetch automatisés. À suivre.
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, SearchProfile, ExtractionMetadata } from '@/types/job-watch';
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
function buildRssUrl(config: JobWatchConfig, profile: SearchProfile): string {
  // L'utilisateur a fourni une URL complète custom : on la respecte telle quelle.
  if (config.rssUrl) return config.rssUrl;

  const params  = new URLSearchParams();

  // Mots-clés : on n'envoie QUE les jobTitles, joints avec `or` (minuscule, le
  // moteur emploi-territorial.fr ne reconnaît pas `OU` ni `OR`). Ajouter les
  // skills comme dans la version précédente intersectait à zéro pour la plupart
  // des profils tech (skills ATS / SaaS / Recruiter rares en territorial).
  const titles = profile.jobTitles.map(t => t.trim()).filter(Boolean);
  if (titles.length > 0) {
    // FAQ ET : phrase exacte via `"..."` ; `or` (lowercase) pour alternatives.
    const expr = titles.length === 1
      ? `"${titles[0]}"`
      : titles.map(t => `"${t}"`).join(' or ');
    params.set('q', expr);
  }

  // Localisation : on préfère le code département (2 chiffres) — plus stable
  // que le nom de ville pour le filtre serveur. Repli sur la ville si pas de
  // département. Le post-filter client repassera dessus de toute façon.
  const dept = profile.location.departmentCodes[0];
  if (dept) params.set('lieu', dept);
  else if (profile.location.city) params.set('lieu', profile.location.city);

  const queryString = params.toString();
  return queryString ? `${ET_RSS_BASE}?${queryString}` : ET_RSS_BASE;
}

/**
 * Vérifie qu'au moins un jobTitle apparaît dans le titre de l'offre, avec
 * frontière de mot. Évite les sous-chaînes parasites (ex. "comm" matchant
 * "commercial"). Si `jobTitles` est vide on accepte tout.
 */
function titleMatchesAnyJobTitle(title: string, jobTitles: string[]): boolean {
  const targets = jobTitles.map(t => t.trim()).filter(Boolean);
  if (targets.length === 0) return true;
  for (const t of targets) {
    const re = new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(title)) return true;
  }
  return false;
}

/**
 * Vérifie que le lieu d'une offre correspond aux départements / ville attendus.
 * Cherche un code département (2 chiffres) précédé d'une frontière non-numérique
 * dans le texte du lieu, ou la ville en clair.
 */
function locationMatchesProfile(
  location: string | null,
  expectedDepts: Set<string>,
  expectedCity: string | null,
): boolean {
  if (expectedDepts.size === 0 && !expectedCity) return true;
  if (!location) return false;

  if (expectedCity) {
    const re = new RegExp('\\b' + expectedCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(location)) return true;
  }

  if (expectedDepts.size > 0) {
    const matches = location.match(/(?:^|\D)(\d{2,3})(?:$|\D)/g) ?? [];
    for (const m of matches) {
      const code = m.replace(/\D/g, '');
      if (expectedDepts.has(code)) return true;
      if (code.length === 3 && expectedDepts.has(code.slice(0, 2))) return true;
    }
  }
  return false;
}

export async function parseEmploiTerritorial(
  config: JobWatchConfig,
  _settings: JobWatchSettings,
  profile: SearchProfile,
): Promise<RawJobOffer[]> {
  const rssUrl = buildRssUrl(config, profile);

  // Les paramètres `q`/`lieu` du flux ne sont pas documentés officiellement et
  // le serveur les rejette parfois (HTTP 4xx/5xx selon l'expression). Comme le
  // post-filter client assure de toute façon la précision, on retombe sur le
  // flux global plutôt que de laisser la source en erreur pendant des jours.
  let items;
  try {
    items = await fetchRssFeed(rssUrl, 'emploi_territorial');
  } catch (err) {
    if (rssUrl === ET_RSS_BASE) throw err;
    console.warn(
      `[emploi-territorial] flux filtré en échec (${err instanceof Error ? err.message : err}) — ` +
      'repli sur le flux global, post-filtrage client conservé.',
    );
    items = await fetchRssFeed(ET_RSS_BASE, 'emploi_territorial');
  }

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

  // Post-filter strict côté client : le RSS est faiblement filtré côté serveur,
  // on rejette ici les offres qui ne matchent pas le profil pour limiter le bruit.
  const expectedDepts = new Set(profile.location.departmentCodes.map(c => c.trim()).filter(Boolean));
  const expectedCity  = profile.location.city?.trim() || null;

  let droppedTitle = 0, droppedLocation = 0, droppedExclusion = 0;
  const filtered: RawJobOffer[] = [];
  for (const o of offers) {
    if (!titleMatchesAnyJobTitle(o.title, profile.jobTitles)) {
      droppedTitle++;
      continue;
    }
    if (!locationMatchesProfile(o.location, expectedDepts, expectedCity)) {
      droppedLocation++;
      continue;
    }
    const text = `${o.title} ${o.descriptionSnippet ?? ''}`;
    if (isExcludedByProfile(text, profile)) {
      droppedExclusion++;
      continue;
    }
    filtered.push(o);
  }

  if (droppedTitle + droppedLocation + droppedExclusion > 0) {
    console.debug(
      `[emploi-territorial] post-filter : ${filtered.length}/${offers.length} retenues ` +
      `(rejets — titre : ${droppedTitle}, lieu : ${droppedLocation}, exclusion : ${droppedExclusion}).`,
    );
  }

  return filtered;
}
