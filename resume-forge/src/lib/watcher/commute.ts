/**
 * Calcul du temps de trajet en transports en commun via l'API IDFM PRIM (Navitia v2).
 *
 * Portail PRIM : https://prim.iledefrance-mobilites.fr/fr/apis/idfm-navitia-general-v2
 *
 * Flux :
 *  1. Géocodage de l'adresse via Nominatim (OpenStreetMap, gratuit, sans clé)
 *  2. Appel PRIM Navitia v2 journeys endpoint
 *  3. Retour du temps en minutes, ou null si indisponible
 *
 * Authentification : header `apiKey` avec le jeton PRIM.
 *
 * Robustesse (une collecte peut demander des centaines de trajets) :
 *  - Cache mémoire des géocodages : l'adresse d'origine n'est géocodée qu'une
 *    fois par session, et les offres d'une même ville partagent l'entrée.
 *  - Throttle Nominatim : la politique d'usage d'OSM impose ≤ 1 req/s ; sans
 *    respect de cette limite les réponses passent en 429/403 et TOUS les
 *    trajets ressortent « Non précisé ». On sérialise donc les appels réseau
 *    avec un intervalle minimal — les hits cache, eux, sont instantanés.
 *  - Throttle Navitia : quota PRIM ~5 req/s ; on espace les appels réels.
 *  - Cache des trajets par destination (coordonnées arrondies) : deux offres
 *    dans la même commune ne déclenchent qu'un appel Navitia.
 *  - Retry + timeout via `fetchResilient` (429/5xx/réseau) au lieu d'un fetch nu.
 *  - Les échecs transitoires (HTTP/réseau) renvoient `error` (≠ `not_found`)
 *    et ne sont PAS mis en cache — un prochain run pourra réessayer.
 */

import { fetchResilient } from './http-client';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NAVITIA_URL   = 'https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys';
const TIMEOUT_MS    = 10_000;

/** Politique d'usage Nominatim : 1 requête/seconde maximum. */
const NOMINATIM_MIN_INTERVAL_MS = 1_100;
/** Quota PRIM Navitia — on reste large sous la limite. */
const NAVITIA_MIN_INTERVAL_MS = 400;

export type CommuteResult =
  | { status: 'ok';        minutes: number }
  | { status: 'not_found'; minutes: null }
  | { status: 'error';     minutes: null; reason: string };

// ── Throttling ────────────────────────────────────────────────────────────────

/**
 * Sérialise les appels réseau vers un service avec un intervalle minimal.
 * Chaîne les promesses pour que deux appels concurrents ne partent pas en même
 * temps (Promise.all sur origin+destination était le cas typique).
 */
function makeThrottle(minIntervalMs: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve();
  let lastCallTs = 0;
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(async () => {
      const wait = lastCallTs + minIntervalMs - Date.now();
      if (wait > 0) await delay(wait);
      lastCallTs = Date.now();
      return fn();
    });
    // La file ne doit jamais rester bloquée sur un échec.
    queue = next.catch(() => undefined);
    return next;
  };
}

const nominatimThrottle = makeThrottle(NOMINATIM_MIN_INTERVAL_MS);
const navitiaThrottle   = makeThrottle(NAVITIA_MIN_INTERVAL_MS);

// ── Geocoding (Nominatim) ─────────────────────────────────────────────────────

type GeocodeOutcome =
  | { ok: true;  coords: [number, number] | null }  // null = adresse inconnue (définitif)
  | { ok: false; reason: string };                   // échec transitoire (HTTP/réseau)

/**
 * Cache mémoire des géocodages. On ne met en cache que les issues définitives
 * (coordonnées trouvées ou adresse inconnue) — jamais les échecs transitoires.
 */
const geocodeCache = new Map<string, [number, number] | null>();
const GEOCODE_CACHE_MAX = 1_000;

function cacheGeocode(key: string, value: [number, number] | null): void {
  if (geocodeCache.size >= GEOCODE_CACHE_MAX) {
    // Éviction naïve du plus ancien (ordre d'insertion des Map).
    const oldest = geocodeCache.keys().next().value;
    if (oldest !== undefined) geocodeCache.delete(oldest);
  }
  geocodeCache.set(key, value);
}

/**
 * Nettoie un libellé de lieu d'offre avant géocodage. Les sources renvoient des
 * formats que Nominatim résout mal tels quels : « 92 - Levallois-Perret »,
 * « Boulogne-Billancourt (92) », « La Défense – 92 »… On retire les codes
 * département décoratifs et on ancre la recherche sur la France.
 */
export function sanitizeLocationForGeocoding(raw: string): string {
  let loc = raw
    .replace(/\s*\(\d{2,3}\)\s*$/,'')          // "Ville (92)"  → "Ville"
    .replace(/^\s*\d{2,3}\s*[-–—]\s*/, '')     // "92 - Ville"  → "Ville"
    .replace(/\s*[-–—]\s*\d{2,3}\s*$/, '')     // "Ville – 92"  → "Ville"
    .replace(/\s+/g, ' ')
    .trim();
  if (!loc) loc = raw.trim();
  if (!/\bfrance\b/i.test(loc)) loc = `${loc}, France`;
  return loc;
}

/** Geocode an address using Nominatim (cached + throttled). */
async function geocodeAddress(address: string): Promise<GeocodeOutcome> {
  const key = address.toLowerCase();
  if (geocodeCache.has(key)) {
    return { ok: true, coords: geocodeCache.get(key) ?? null };
  }

  const params = new URLSearchParams({
    q:      address,
    format: 'json',
    limit:  '1',
  });
  const url = `${NOMINATIM_URL}?${params.toString()}`;

  try {
    const res = await nominatimThrottle(() =>
      fetchResilient(url, {
        source:    'nominatim',
        timeoutMs: TIMEOUT_MS,
        headers:   { 'User-Agent': 'ResumeForge/1.0' },
      })
    );
    if (!res.ok) {
      // 429/403/5xx : transitoire — ne pas polluer le cache.
      return { ok: false, reason: `Nominatim HTTP ${res.status}` };
    }
    const data = await res.json() as Array<{ lon: string; lat: string }>;
    const coords: [number, number] | null = data.length
      ? [parseFloat(data[0].lon), parseFloat(data[0].lat)]
      : null;
    cacheGeocode(key, coords);
    return { ok: true, coords };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Géocode un lieu d'offre : essaie la version nettoyée, puis retombe sur le
 * libellé brut si le nettoyage n'a rien donné (cas des libellés atypiques).
 */
async function geocodeJobLocation(rawLocation: string): Promise<GeocodeOutcome> {
  const cleaned = sanitizeLocationForGeocoding(rawLocation);
  const first = await geocodeAddress(cleaned);
  if (!first.ok || first.coords) return first;
  if (cleaned.toLowerCase() !== rawLocation.trim().toLowerCase()) {
    return geocodeAddress(rawLocation.trim());
  }
  return first;
}

// ── Journeys (Navitia) ────────────────────────────────────────────────────────

/**
 * Cache des trajets par destination arrondie (~100 m) + heure de départ.
 * On ne met en cache que les issues définitives (`ok` / `not_found`).
 */
const journeyCache = new Map<string, CommuteResult>();
const JOURNEY_CACHE_MAX = 2_000;

function journeyCacheKey(from: string, lat: number, lon: number, departureTime: string): string {
  return `${from}|${lat.toFixed(3)},${lon.toFixed(3)}|${departureTime}`;
}

/**
 * Returns the datetime string for the next weekday (Mon–Fri) at the given HH:MM,
 * formatted as YYYYMMDDTHHmmss (Navitia format).
 */
function nextWeekdayDatetime(timeHHMM: string): string {
  const [hh, mm] = timeHHMM.split(':').map(Number);
  const d = new Date();
  d.setHours(hh, mm, 0, 0);

  // If today is Sat (6) or Sun (0), move to next Monday
  const day = d.getDay();
  if (day === 6) d.setDate(d.getDate() + 2);
  else if (day === 0) d.setDate(d.getDate() + 1);

  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** Appel Navitia journeys entre deux points (throttled + caché). */
async function fetchJourneyMinutes(
  originCoords:  [number, number],
  destLat:       number,
  destLon:       number,
  departureTime: string,
  navitiaApiKey: string,
): Promise<CommuteResult> {
  const fromPlace = `${originCoords[0]};${originCoords[1]}`;
  const cacheKey  = journeyCacheKey(fromPlace, destLat, destLon, departureTime);
  const cached    = journeyCache.get(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    from:                   fromPlace,
    to:                     `${destLon};${destLat}`,
    datetime:               nextWeekdayDatetime(departureTime),
    count:                  '1',
    'first_section_mode[]': 'walking',
    'last_section_mode[]':  'walking',
  });
  const url = `${NAVITIA_URL}?${params.toString()}`;

  try {
    const res = await navitiaThrottle(() =>
      fetchResilient(url, {
        source:    'navitia',
        timeoutMs: TIMEOUT_MS,
        headers: {
          'apiKey':     navitiaApiKey,
          'User-Agent': 'ResumeForge/1.0',
        },
        // Un 404 Navitia = point hors zone de couverture IDFM (offre en
        // province) : définitif, inutile de retenter.
        retry: {
          shouldRetry: (r, err) => {
            if (err) return true;
            if (!r) return true;
            return r.status === 429 || (r.status >= 500 && r.status < 600);
          },
        },
      })
    );

    if (res.status === 404) {
      const result: CommuteResult = { status: 'not_found', minutes: null };
      cacheJourney(cacheKey, result);
      return result;
    }
    if (!res.ok) {
      return { status: 'error', minutes: null, reason: `HTTP ${res.status}` };
    }

    const data = await res.json() as { journeys?: Array<{ duration: number }> };
    const journeys = data.journeys ?? [];

    const result: CommuteResult = journeys.length
      ? { status: 'ok', minutes: Math.round(journeys[0].duration / 60) }
      : { status: 'not_found', minutes: null };
    cacheJourney(cacheKey, result);
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 'error', minutes: null, reason };
  }
}

function cacheJourney(key: string, result: CommuteResult): void {
  if (journeyCache.size >= JOURNEY_CACHE_MAX) {
    const oldest = journeyCache.keys().next().value;
    if (oldest !== undefined) journeyCache.delete(oldest);
  }
  journeyCache.set(key, result);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Lieux « à distance » / vagues pour lesquels un trajet n'a pas de sens. */
const SKIP_PATTERNS = /télétravail|remote|à distance|france entière|toute (la )?france|non précis/i;

/** Compute commute time in minutes using Navitia API */
export async function getCommuteMinutes(
  originAddress:      string,
  destinationAddress: string,
  departureTime:      string,  // "HH:MM"
  navitiaApiKey:      string
): Promise<CommuteResult> {
  if (SKIP_PATTERNS.test(destinationAddress)) {
    return { status: 'not_found', minutes: null };
  }

  const origin = await geocodeAddress(originAddress);
  if (!origin.ok) return { status: 'error', minutes: null, reason: origin.reason };
  if (!origin.coords) {
    // L'adresse de départ vient des réglages utilisateur : introuvable = problème
    // de config, pas une caractéristique de l'offre → `error` (« Non calculé »).
    return { status: 'error', minutes: null, reason: 'adresse de départ introuvable' };
  }

  const dest = await geocodeJobLocation(destinationAddress);
  if (!dest.ok) return { status: 'error', minutes: null, reason: dest.reason };
  if (!dest.coords) return { status: 'not_found', minutes: null };

  return fetchJourneyMinutes(origin.coords, dest.coords[1], dest.coords[0], departureTime, navitiaApiKey);
}

/**
 * Compute commute time using GPS coordinates for the destination.
 * Used for offers that provide lat/lon directly (skips Nominatim on the destination).
 */
export async function getCommuteMinutesByCoords(
  originAddress:   string,
  destLat:         number,
  destLon:         number,
  departureTime:   string,
  navitiaApiKey:   string
): Promise<CommuteResult> {
  const origin = await geocodeAddress(originAddress);
  if (!origin.ok) return { status: 'error', minutes: null, reason: origin.reason };
  if (!origin.coords) {
    return { status: 'error', minutes: null, reason: 'adresse de départ introuvable' };
  }

  return fetchJourneyMinutes(origin.coords, destLat, destLon, departureTime, navitiaApiKey);
}

/** Delay helper — également utilisé par les throttles internes */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Test-only: vide les caches géocodage/trajets. */
export function __resetCommuteCachesForTests(): void {
  geocodeCache.clear();
  journeyCache.clear();
}
