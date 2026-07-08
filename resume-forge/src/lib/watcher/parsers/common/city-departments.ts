/**
 * Mapping minimal des grandes villes françaises vers leur code département.
 *
 * Utilisé en repli quand le profil de recherche n'a pas de `departmentCodes`
 * mais une `city` renseignée :
 *  - APEC : active le filtre de localisation post-fetch,
 *  - France Travail : fournit le paramètre `departement` — sans lui la
 *    recherche couvre la France entière et noie la veille sous des offres
 *    hors zone (le score seul ne suffit pas à les écarter).
 *
 * Volontairement minimal (pas de dépendance INSEE) : pour les villes absentes,
 * les post-filtres clients gardent la main.
 */
export const CITY_TO_DEPT: Record<string, string> = {
  paris: '75', lyon: '69', marseille: '13', toulouse: '31', nice: '06',
  nantes: '44', strasbourg: '67', montpellier: '34', bordeaux: '33', lille: '59',
  rennes: '35', reims: '51', 'le havre': '76', 'saint-étienne': '42',
  toulon: '83', grenoble: '38', dijon: '21', angers: '49', nîmes: '30',
  'saint-denis': '93', 'le mans': '72', aix: '13', brest: '29',
  tours: '37', amiens: '80', limoges: '87', clermont: '63', besançon: '25',
  metz: '57', orleans: '45', orléans: '45', mulhouse: '68', rouen: '76',
  caen: '14', nancy: '54', avignon: '84', perpignan: '66',
  versailles: '78', creteil: '94', créteil: '94', boulogne: '92',
  'boulogne-billancourt': '92', nanterre: '92', 'levallois-perret': '92',
  courbevoie: '92', 'issy-les-moulineaux': '92', 'la défense': '92',
  argenteuil: '95', montreuil: '93',
};

/** Code département d'une ville connue, ou undefined. Insensible à la casse. */
export function cityToDeptCode(city: string | null | undefined): string | undefined {
  const key = city?.trim().toLowerCase();
  return key ? CITY_TO_DEPT[key] : undefined;
}
