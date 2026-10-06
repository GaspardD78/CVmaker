/**
 * Détecte une piste « secteur public » (spec 007, phase 2).
 *
 * Sert à l'assistant de configuration : pour une telle piste, il propose
 * « Choisir le service public » avec le versant territorial. Détection simple,
 * sur les intitulés, domaines et compétences saisis ; aucune IA.
 */

const PUBLIC_SECTOR_RE = new RegExp([
  'fonction publique', 'secteur public', 'emploi public', 'collectivit', 'territorial',
  'mairie', 'commune', 'intercommunal', 'm[ée]tropole', 'd[ée]partement',
  'conseil r[ée]gional', 'centre de gestion', '\\bcdg\\b', '\\bfpt\\b', 'pr[ée]fecture',
  'cnfpt', '\\bccas\\b', '\\bepci\\b', 'administration',
].join('|'), 'i');

export function isPublicSectorText(...texts: Array<string | string[] | undefined>): boolean {
  const joined = texts.flatMap(t => (Array.isArray(t) ? t : [t ?? ''])).join(' ');
  return PUBLIC_SECTOR_RE.test(joined);
}
