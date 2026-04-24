/**
 * Location extraction utilities for French job markets.
 * All parsers share this so location heuristics are consistent.
 */

/** "Paris (75)" or "Gironde (33)" */
const DEPT_PARENTHESIS = /([A-ZÀ-Ú][a-zà-ú\s-]+)\s*\((\d{2,3})\)/;
/** "75 - Paris" or "33 - Gironde" */
const DEPT_DASH        = /(\d{2,3})\s*[-–]\s*([A-ZÀ-Ú][a-zà-ú\s-]+)/;

/** Common French cities / regions */
const CITY_NAMES = [
  'Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Toulouse', 'Nantes', 'Strasbourg',
  'Lille', 'Rennes', 'Montpellier', 'Nice', 'Grenoble', 'Dijon', 'Rouen', 'Caen',
  'Reims', 'Metz', 'Tours', 'Amiens', 'Limoges', 'Clermont-Ferrand', 'Brest',
  'Le Havre', 'Toulon', 'Saint-Étienne', 'Angers', 'Villeurbanne', 'Aix-en-Provence',
  'Le Mans', 'Boulogne-Billancourt', 'Nîmes', 'Perpignan', 'Orléans',
];
const CITY_RE = new RegExp(`\\b(${CITY_NAMES.join('|')})\\b`, 'i');

/** French regions */
const REGIONS = [
  'Île-de-France', 'Île de France', 'IDF',
  'Hauts-de-Seine', 'Seine-Saint-Denis', 'Val-de-Marne', 'Val-d\'Oise',
  'Yvelines', 'Seine-et-Marne', 'Essonne',
  'Auvergne-Rhône-Alpes', 'Provence-Alpes-Côte d\'Azur', 'PACA',
  'Occitanie', 'Nouvelle-Aquitaine', 'Grand Est', 'Bretagne', 'Normandie',
  'Centre-Val de Loire', 'Bourgogne-Franche-Comté', 'Pays de la Loire',
  'Hauts-de-France', 'Corse',
];
const REGION_RE = new RegExp(`\\b(${REGIONS.map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');

/**
 * Extract a location string from free-form text.
 * Returns the best match or null if nothing recognisable found.
 */
export function extractLocationFromText(text: string): string | null {
  // "Paris (75)" style
  let m = DEPT_PARENTHESIS.exec(text);
  if (m) return `${m[1].trim()} (${m[2]})`;

  // "75 - Paris" style
  m = DEPT_DASH.exec(text);
  if (m) return `${m[2].trim()} (${m[1]})`;

  // Region first (longer match → fewer false positives)
  m = REGION_RE.exec(text);
  if (m) return m[1];

  // City names
  m = CITY_RE.exec(text);
  if (m) return m[1];

  // 5-digit postal code
  m = /\b(\d{5})\b/.exec(text);
  if (m) return m[1];

  return null;
}

/**
 * Normalise a raw location string from an API (may already be a well-formed string).
 * - Strips "France" when combined with a city
 * - Cleans whitespace / trailing punctuation
 */
export function normalizeLocation(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let loc = raw
    .replace(/,?\s*France\s*$/i, '')
    .replace(/,?\s*FR\s*$/i, '')
    .trim();
  if (!loc) return null;
  return loc.charAt(0).toUpperCase() + loc.slice(1);
}
