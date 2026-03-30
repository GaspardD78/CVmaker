/**
 * Calcul du temps de trajet en transports en commun via l'API Navitia.
 *
 * Flux :
 *  1. Géocodage de l'adresse via Nominatim (OpenStreetMap, gratuit, sans clé)
 *  2. Appel Navitia journeys endpoint
 *  3. Retour du temps en minutes, ou null si indisponible
 */

import { tauriFetch } from './http';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NAVITIA_URL   = 'https://api.navitia.io/v1/coverage/fr-idf/journeys';
const TIMEOUT_MS    = 10_000;

export type CommuteResult =
  | { status: 'ok';        minutes: number }
  | { status: 'not_found'; minutes: null }
  | { status: 'error';     minutes: null; reason: string };

/** Geocode an address using Nominatim. Returns [lon, lat] or null. */
async function geocodeAddress(address: string): Promise<[number, number] | null> {
  const params = new URLSearchParams({
    q:       address,
    format:  'json',
    limit:   '1',
  });
  const url = `${NOMINATIM_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await tauriFetch(url, {
      signal:  controller.signal,
      headers: { 'User-Agent': 'ResumeForge/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json() as Array<{ lon: string; lat: string }>;
    if (!data.length) return null;
    return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
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

/** Compute commute time in minutes using Navitia API */
export async function getCommuteMinutes(
  originAddress:      string,
  destinationAddress: string,
  departureTime:      string,  // "HH:MM"
  navitiaApiKey:      string
): Promise<CommuteResult> {
  // Skip remote/vague locations
  const skipPatterns = /télétravail|remote|france entière|toute france|non précis/i;
  if (skipPatterns.test(destinationAddress)) {
    return { status: 'not_found', minutes: null };
  }

  const [originCoords, destCoords] = await Promise.all([
    geocodeAddress(originAddress),
    geocodeAddress(destinationAddress),
  ]);

  if (!originCoords || !destCoords) {
    return { status: 'not_found', minutes: null };
  }

  const fromPlace = `${originCoords[0]};${originCoords[1]}`;
  const toPlace   = `${destCoords[0]};${destCoords[1]}`;
  const datetime  = nextWeekdayDatetime(departureTime);

  const params = new URLSearchParams({
    from:                    fromPlace,
    to:                      toPlace,
    datetime,
    count:                   '1',
    'first_section_mode[]':  'walking',
    'last_section_mode[]':   'walking',
  });
  const url = `${NAVITIA_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await tauriFetch(url, {
      signal:  controller.signal,
      headers: {
        'Authorization': navitiaApiKey,
        'User-Agent':    'ResumeForge/1.0',
      },
    });

    if (!res.ok) {
      return { status: 'error', minutes: null, reason: `HTTP ${res.status}` };
    }

    const data = await res.json() as { journeys?: Array<{ duration: number }> };
    const journeys = data.journeys ?? [];

    if (!journeys.length) {
      return { status: 'not_found', minutes: null };
    }

    const minutes = Math.round(journeys[0].duration / 60);
    return { status: 'ok', minutes };

  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 'error', minutes: null, reason };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Compute commute time using GPS coordinates for the destination.
 * Used for France Travail offers that provide lat/lon directly (skips Nominatim).
 */
export async function getCommuteMinutesByCoords(
  originAddress:   string,
  destLat:         number,
  destLon:         number,
  departureTime:   string,
  navitiaApiKey:   string
): Promise<CommuteResult> {
  const originCoords = await geocodeAddress(originAddress);
  if (!originCoords) {
    return { status: 'not_found', minutes: null };
  }

  const fromPlace = `${originCoords[0]};${originCoords[1]}`;
  const toPlace   = `${destLon};${destLat}`;
  const datetime  = nextWeekdayDatetime(departureTime);

  const params = new URLSearchParams({
    from:                    fromPlace,
    to:                      toPlace,
    datetime,
    count:                   '1',
    'first_section_mode[]':  'walking',
    'last_section_mode[]':   'walking',
  });
  const url = `${NAVITIA_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await tauriFetch(url, {
      signal:  controller.signal,
      headers: {
        'Authorization': navitiaApiKey,
        'User-Agent':    'ResumeForge/1.0',
      },
    });

    if (!res.ok) {
      return { status: 'error', minutes: null, reason: `HTTP ${res.status}` };
    }

    const data = await res.json() as { journeys?: Array<{ duration: number }> };
    const journeys = data.journeys ?? [];

    if (!journeys.length) {
      return { status: 'not_found', minutes: null };
    }

    const minutes = Math.round(journeys[0].duration / 60);
    return { status: 'ok', minutes };

  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 'error', minutes: null, reason };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Delay helper — used to respect Navitia quota between batch calls */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
