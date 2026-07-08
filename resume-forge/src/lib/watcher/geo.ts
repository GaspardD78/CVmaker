/**
 * geo.ts — Filtrage géographique côté client (post-fetch).
 *
 * Pourquoi ce module existe :
 *   Le seul filtrage géographique de la veille était le paramètre serveur des
 *   sources (`commune`+`distance` ou `departement` pour France Travail). Dès
 *   que ce paramètre saute — code INSEE absent du profil (profil ancien ou
 *   pré-rempli depuis le CV), commune rejetée par l'API avec repli département
 *   vide — la recherche couvre la France entière et des offres à 600 km
 *   (Auch, Biarritz…) atterrissent dans la veille : ni le scorer ni le
 *   fetcher ne regardaient la localisation.
 *
 * Ce module fournit :
 *   - `resolveProfileGeo`   : coordonnées + département de la zone de recherche
 *     (via geo.api.gouv.fr, INSEE prioritaire, repli sur le nom de ville) ;
 *   - `classifyOfferZone`   : verdict `in` / `out` / `unknown` par offre —
 *     haversine sur les coordonnées GPS quand la source les fournit (France
 *     Travail, APEC), sinon comparaison du département extrait du libellé
 *     (« 32 - Auch », « Auch (32) ») avec un centroïde départemental ;
 *   - fail-open : sans données fiables le verdict est `unknown` et l'offre
 *     est conservée — on ne jette jamais une offre sur un doute.
 */

import { tauriFetch } from './http';
import type { SearchProfile } from '@/types/job-watch';
import { isValidInseeCode } from './profile-to-query';

// ── Distance ─────────────────────────────────────────────────────────────────

/** Distance orthodromique en km entre deux points (formule de haversine). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // rayon terrestre moyen (km)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ── Centroïdes départementaux ────────────────────────────────────────────────

/**
 * Coordonnées approximatives (préfecture) de chaque département. Utilisées
 * uniquement pour écarter les offres SANS coordonnées GPS dont le libellé
 * porte un code département manifestement hors zone — d'où la marge large
 * (`DEPT_MARGIN_KM`) qui absorbe l'imprécision centroïde/commune réelle.
 */
export const DEPT_CENTROIDS: Record<string, [number, number]> = {
  '01': [46.21, 5.23], '02': [49.56, 3.62], '03': [46.57, 3.33], '04': [44.09, 6.24],
  '05': [44.56, 6.08], '06': [43.70, 7.27], '07': [44.73, 4.60], '08': [49.77, 4.72],
  '09': [42.97, 1.61], '10': [48.30, 4.08], '11': [43.21, 2.35], '12': [44.35, 2.57],
  '13': [43.30, 5.37], '14': [49.18, -0.37], '15': [44.93, 2.44], '16': [45.65, 0.16],
  '17': [46.16, -1.15], '18': [47.08, 2.40], '19': [45.27, 1.77],
  '2A': [41.92, 8.74], '2B': [42.70, 9.45],
  '21': [47.32, 5.04], '22': [48.51, -2.77], '23': [46.17, 1.87], '24': [45.18, 0.72],
  '25': [47.24, 6.02], '26': [44.93, 4.89], '27': [49.02, 1.15], '28': [48.44, 1.49],
  '29': [48.00, -4.10], '30': [43.84, 4.36], '31': [43.60, 1.44], '32': [43.65, 0.59],
  '33': [44.84, -0.58], '34': [43.61, 3.88], '35': [48.11, -1.68], '36': [46.81, 1.69],
  '37': [47.39, 0.69], '38': [45.19, 5.72], '39': [46.67, 5.55], '40': [43.89, -0.50],
  '41': [47.59, 1.33], '42': [45.44, 4.39], '43': [45.04, 3.89], '44': [47.22, -1.55],
  '45': [47.90, 1.90], '46': [44.45, 1.44], '47': [44.20, 0.62], '48': [44.52, 3.50],
  '49': [47.47, -0.55], '50': [49.12, -1.09], '51': [48.96, 4.36], '52': [48.11, 5.14],
  '53': [48.07, -0.77], '54': [48.69, 6.18], '55': [48.77, 5.16], '56': [47.66, -2.76],
  '57': [49.12, 6.18], '58': [46.99, 3.16], '59': [50.63, 3.06], '60': [49.43, 2.08],
  '61': [48.43, 0.09], '62': [50.29, 2.78], '63': [45.78, 3.08], '64': [43.30, -0.37],
  '65': [43.23, 0.07], '66': [42.70, 2.90], '67': [48.58, 7.75], '68': [48.08, 7.36],
  '69': [45.76, 4.84], '70': [47.62, 6.16], '71': [46.31, 4.83], '72': [48.00, 0.20],
  '73': [45.57, 5.92], '74': [45.90, 6.13], '75': [48.86, 2.35], '76': [49.44, 1.10],
  '77': [48.54, 2.66], '78': [48.80, 2.13], '79': [46.32, -0.46], '80': [49.89, 2.30],
  '81': [43.93, 2.15], '82': [44.02, 1.35], '83': [43.12, 5.93], '84': [43.95, 4.81],
  '85': [46.67, -1.43], '86': [46.58, 0.34], '87': [45.83, 1.26], '88': [48.17, 6.45],
  '89': [47.80, 3.57], '90': [47.64, 6.86], '91': [48.63, 2.44], '92': [48.89, 2.20],
  '93': [48.91, 2.44], '94': [48.79, 2.46], '95': [49.04, 2.08],
  '971': [16.00, -61.73], '972': [14.61, -61.08], '973': [4.94, -52.33],
  '974': [-20.88, 55.45], '976': [-12.78, 45.23],
};

/**
 * Extrait un code département d'un libellé de lieu d'offre :
 * « 32 - Auch », « Auch (32) », « Auch - 32 », « 2A - Ajaccio »…
 * Retourne null si aucun code reconnu (ville seule, « France entière »…).
 */
export function extractDeptFromLocationText(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  const m =
    t.match(/^(2[AB]|\d{2,3})\s*[-–—]/) ??       // "32 - Auch"
    t.match(/\((2[AB]|\d{2,3})\)\s*$/) ??        // "Auch (32)"
    t.match(/[-–—]\s*(2[AB]|\d{2,3})\s*$/);      // "Auch - 32"
  if (!m) return null;
  const code = m[1];
  return code in DEPT_CENTROIDS ? code : null;
}

// ── Zone de recherche ────────────────────────────────────────────────────────

export interface GeoZone {
  lat: number;
  lon: number;
  /** Code INSEE résolu (utilisable comme paramètre `commune` France Travail). */
  inseeCode: string | null;
  deptCode: string | null;
}

/**
 * Marge ajoutée au rayon pour les comparaisons GPS : les coordonnées d'offre
 * comme celles de la zone pointent souvent le centre de la commune, pas
 * l'adresse exacte.
 */
const GPS_MARGIN_KM = 15;
/**
 * Marge (généreuse) pour les comparaisons par centroïde départemental : une
 * commune peut être à ~80 km du centroïde de son département.
 */
const DEPT_MARGIN_KM = 80;
/** Rayon effectif minimal — `radiusKm = 0` signifie « ville uniquement ». */
const MIN_EFFECTIVE_RADIUS_KM = 5;

export type ZoneVerdict = 'in' | 'out' | 'unknown';

/**
 * Classe une offre par rapport à la zone de recherche.
 *  - Coordonnées GPS présentes → haversine vs `radius + GPS_MARGIN_KM`.
 *  - Sinon, code département dans le libellé → distance au centroïde
 *    départemental vs `radius + DEPT_MARGIN_KM`.
 *  - Sinon → `unknown` (l'offre est conservée : fail-open).
 */
export function classifyOfferZone(
  offer: { locationLat?: number | null; locationLon?: number | null; location?: string | null },
  zone: GeoZone,
  radiusKm: number,
): ZoneVerdict {
  const radius = Math.max(radiusKm, MIN_EFFECTIVE_RADIUS_KM);

  if (offer.locationLat != null && offer.locationLon != null) {
    const d = haversineKm(zone.lat, zone.lon, offer.locationLat, offer.locationLon);
    return d <= radius + GPS_MARGIN_KM ? 'in' : 'out';
  }

  const dept = extractDeptFromLocationText(offer.location);
  if (dept) {
    const [dLat, dLon] = DEPT_CENTROIDS[dept];
    const d = haversineKm(zone.lat, zone.lon, dLat, dLon);
    return d <= radius + DEPT_MARGIN_KM ? 'in' : 'out';
  }

  return 'unknown';
}

// ── Résolution de la zone via geo.api.gouv.fr ────────────────────────────────

interface GeoApiCommune {
  nom?: string;
  code?: string;
  codeDepartement?: string;
  centre?: { coordinates?: [number, number] }; // GeoJSON: [lon, lat]
}

/** Cache mémoire — la zone ne change pas au cours d'une session. */
const zoneCache = new Map<string, GeoZone | null>();

function communeToZone(c: GeoApiCommune): GeoZone | null {
  const coords = c.centre?.coordinates;
  if (!coords || coords.length < 2) return null;
  return {
    lon:       coords[0],
    lat:       coords[1],
    inseeCode: c.code ?? null,
    deptCode:  c.codeDepartement ?? null,
  };
}

/**
 * Résout la zone de recherche du profil en coordonnées + département.
 *  1. Code INSEE valide → lookup direct `/communes/{code}` ;
 *  2. Sinon nom de ville → recherche `/communes?nom=…` (boost population).
 * Retourne null si le profil n'a pas de localisation ou si l'API échoue
 * (le post-filtre est alors désactivé — fail-open).
 */
export async function resolveProfileGeo(
  location: SearchProfile['location'],
): Promise<GeoZone | null> {
  const insee = location.inseeCode?.trim() ?? '';
  const city  = location.city?.trim() || stripDeptSuffix(location.label);
  const key   = `${insee}|${city.toLowerCase()}`;
  if (!insee && !city) return null;
  if (zoneCache.has(key)) return zoneCache.get(key) ?? null;

  let zone: GeoZone | null = null;
  try {
    if (insee && isValidInseeCode(insee)) {
      const res = await tauriFetch(
        `https://geo.api.gouv.fr/communes/${encodeURIComponent(insee)}?fields=nom,code,codeDepartement,centre`,
      );
      if (res.ok) zone = communeToZone(await res.json() as GeoApiCommune);
    }
    if (!zone && city) {
      const res = await tauriFetch(
        `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(city)}&fields=nom,code,codeDepartement,centre&boost=population&limit=1`,
      );
      if (res.ok) {
        const list = await res.json() as GeoApiCommune[];
        if (list.length > 0) zone = communeToZone(list[0]);
      }
    }
    // On ne met en cache que les issues d'appels aboutis (zone trouvée ou
    // commune inconnue) — un échec réseau doit pouvoir être retenté.
    zoneCache.set(key, zone);
  } catch (err) {
    console.warn('[geo] résolution de la zone de recherche impossible — post-filtre géo désactivé pour ce run :', err);
    return null;
  }

  if (!zone) {
    console.warn(`[geo] commune introuvable pour "${city || insee}" — post-filtre géo désactivé.`);
  }
  return zone;
}

/** « Carrières-sous-Poissy (78) » → « Carrières-sous-Poissy ». */
function stripDeptSuffix(label: string | null | undefined): string {
  return (label ?? '').replace(/\s*\((2[AB]|\d{2,3})\)\s*$/, '').trim();
}

/** Test-only : vide le cache de zones. */
export function __resetGeoCacheForTests(): void {
  zoneCache.clear();
}
