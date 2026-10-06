/**
 * Lieux de « Choisir le service public » (spec 007).
 *
 * Le filtre `…/mot-cles/<mots>/localisation/<id>/` attend un identifiant
 * INTERNE du site (Yvelines = 289, Île-de-France = 208), pas un code de
 * département. `data/csp-localisations.json` est la table nom → identifiant
 * extraite du formulaire réel (335 lieux). Les départements et régions sont
 * rapprochés par nom normalisé (sans accent ni ponctuation).
 */

import table from './data/csp-localisations.json';
import { cityToDeptCode } from './common/city-departments';

/** Nom normalisé : minuscules, sans accent, ponctuation et apostrophes en espaces. */
export function normalizePlaceName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ID_BY_NAME: Map<string, number> = new Map(
  Object.entries(table as Record<string, number>).map(([name, id]) => [normalizePlaceName(name), id]),
);

/** Identifiant interne d'un lieu par son nom (tel qu'affiché par le site, ou normalisé). */
export function cspLocationId(name: string): number | null {
  return ID_BY_NAME.get(normalizePlaceName(name)) ?? null;
}

/** Code de département → nom du lieu sur le site. */
export const DEPARTMENT_PLACE: Record<string, string> = {
  '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes Hte Provence', '05': 'Hautes Alpes',
  '06': 'Alpes Maritimes', '07': 'Ardèche', '08': 'Ardennes', '09': 'Ariège', '10': 'Aube', '11': 'Aude',
  '12': 'Aveyron', '13': 'Bouches du Rhône', '14': 'Calvados', '15': 'Cantal', '16': 'Charente',
  '17': 'Charente Maritime', '18': 'Cher', '19': 'Corrèze', '2A': 'Corse du Sud', '2B': 'Haute Corse',
  '21': "Cote d'Or", '22': 'Côtes d Armor', '23': 'Creuse', '24': 'Dordogne', '25': 'Doubs', '26': 'Drôme',
  '27': 'Eure', '28': 'Eure et Loir', '29': 'Finistère', '30': 'Gard', '31': 'Haute Garonne', '32': 'Gers',
  '33': 'Gironde', '34': 'Hérault', '35': 'Ille et Vilaine', '36': 'Indre', '37': 'Indre et Loire',
  '38': 'Isère', '39': 'Jura', '40': 'Landes', '41': 'Loir et Cher', '42': 'Loire', '43': 'Haute Loire',
  '44': 'Loire Atlantique', '45': 'Loiret', '46': 'Lot', '47': 'Lot et Garonne', '48': 'Lozère',
  '49': 'Maine et Loire', '50': 'Manche', '51': 'Marne', '52': 'Haute-Marne', '53': 'Mayenne',
  '54': 'Meurthe et Moselle', '55': 'Meuse', '56': 'Morbihan', '57': 'Moselle', '58': 'Nièvre', '59': 'Nord',
  '60': 'Oise', '61': 'Orne', '62': 'Pas de Calais', '63': 'Puy de Dôme', '64': 'Pyrénées Atlantiques',
  '65': 'Hautes Pyrénées', '66': 'Pyrénées Orientales', '67': 'Bas Rhin', '68': 'Haut Rhin', '69': 'Rhône',
  '70': 'Haute Saône', '71': 'Saône et Loire', '72': 'Sarthe', '73': 'Savoie', '74': 'Haute Savoie',
  '75': 'Paris', '76': 'Seine Maritime', '77': 'Seine et Marne', '78': 'Yvelines', '79': 'Deux Sèvres',
  '80': 'Somme', '81': 'Tarn', '82': 'Tarn et Garonne', '83': 'Var', '84': 'Vaucluse', '85': 'Vendée',
  '86': 'Vienne', '87': 'Haute Vienne', '88': 'Vosges', '89': 'Yonne', '90': 'Belfort', '91': 'Essonne',
  '92': 'Hauts-de-Seine', '93': 'Seine Saint-Denis', '94': 'Val de Marne', '95': "Val d'Oise",
  '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane', '974': 'Réunion', '976': 'Mayotte',
};

/** Région → départements. */
const REGION_DEPARTMENTS: Record<string, string[]> = {
  'Île-de-France': ['75', '77', '78', '91', '92', '93', '94', '95'],
  'Auvergne-Rhône-Alpes': ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
  'Bourgogne-Franche-Comté': ['21', '25', '39', '58', '70', '71', '89', '90'],
  'Bretagne': ['22', '29', '35', '56'],
  'Centre - Val de Loire': ['18', '28', '36', '37', '41', '45'],
  'Corse': ['2A', '2B'],
  'Grand Est': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
  'Hauts de France': ['02', '59', '60', '62', '80'],
  'Normandie': ['14', '27', '50', '61', '76'],
  'Nouvelle Aquitaine': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
  'Occitanie': ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
  'Pays de La Loire': ['44', '49', '53', '72', '85'],
  "Provence-Alpes-Côte-D'Azur": ['04', '05', '06', '13', '83', '84'],
  'DOM': ['971', '972', '973', '974', '976'],
};

const REGION_OF_DEPARTMENT: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_DEPARTMENTS).flatMap(([region, depts]) => depts.map(d => [d, region])),
);

/** Départements d'une région, par identifiant de lieu du site (null si ce n'est pas une région connue). */
export function departmentsOfRegionId(id: number): string[] | null {
  for (const [region, depts] of Object.entries(REGION_DEPARTMENTS)) {
    if (cspLocationId(region) === id) return depts;
  }
  return null;
}

export function departmentLocationId(code: string): number | null {
  const name = DEPARTMENT_PLACE[code];
  return name ? cspLocationId(name) : null;
}

export function regionLocationIdOf(code: string): number | null {
  const region = REGION_OF_DEPARTMENT[code];
  return region ? cspLocationId(region) : null;
}

/** Au-delà de ce rayon, un département seul est trop étroit : on cherche sur la région. */
export const REGION_RADIUS_KM = 40;
/** Une recherche par lieu et par intitulé : on borne le nombre de lieux. */
export const MAX_LOCATION_SEARCHES = 2;

export interface LocationQuery {
  departmentCodes: string[];
  city: string;
  radiusKm: number;
}

function normalizeCode(raw: string): string {
  const c = raw.trim().toUpperCase();
  return /^\d$/.test(c) ? `0${c}` : c;
}

/**
 * Identifiants de lieu à interroger pour la localisation de la piste.
 *  - un département et un rayon qui ne dépasse pas {@link REGION_RADIUS_KM} → ce département ;
 *  - plusieurs départements ou un grand rayon → la ou les régions concernées
 *    (au plus {@link MAX_LOCATION_SEARCHES}) ;
 *  - lieu inconnu → aucun filtre (le post-filtre client reste actif).
 */
export function resolveCspLocationIds(query: LocationQuery): number[] {
  return resolveCspLocations(query).ids;
}

export interface ResolvedLocations {
  /** Identifiants de lieu à interroger. */
  ids: number[];
  /**
   * Départements couverts par ces requêtes, plus ceux de la piste : un lieu
   * retourné par la recherche d'une région est dans la zone dès qu'il est dans
   * un de ces départements (le post-filtre doit suivre la requête).
   */
  departments: Set<string>;
}

/** Comme {@link resolveCspLocationIds}, avec les départements couverts par la requête. */
export function resolveCspLocations(query: LocationQuery): ResolvedLocations {
  const own = query.departmentCodes.map(normalizeCode).filter(Boolean);
  let codes = own;
  if (codes.length === 0) {
    const fromCity = cityToDeptCode(query.city);
    if (fromCity) codes = [normalizeCode(fromCity)];
  }
  const departments = new Set<string>(own);
  if (codes.length === 0) return { ids: [], departments };

  let ids: number[] = [];
  if (codes.length === 1 && query.radiusKm <= REGION_RADIUS_KM) {
    const dept = departmentLocationId(codes[0]);
    if (dept) ids = [dept];
  }
  if (ids.length === 0) {
    ids = [...new Set(codes.map(regionLocationIdOf).filter((id): id is number => id !== null))]
      .slice(0, MAX_LOCATION_SEARCHES);
  }
  for (const id of ids) {
    for (const code of departmentsOfRegionId(id) ?? []) departments.add(code);
    for (const code of codes) if (departmentLocationId(code) === id) departments.add(code);
  }
  for (const code of codes) if (ids.length === 0 || ids.some(id => id === departmentLocationId(code))) departments.add(code);
  return { ids, departments };
}
