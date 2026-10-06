/**
 * « Ignorer ce type de poste chez elle » : exclusion d'un terme de titre pour
 * une entreprise précise. Partagé par le scorer (offres futures) et l'affichage
 * (offres déjà enregistrées), pour que les deux appliquent la même règle.
 */

export interface CompanyTitleExclusion {
  company: string;
  term: string;
}

function strip(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Vrai si `title` contient `term` comme mot entier (accents et casse ignorés). */
function hasWord(term: string, title: string): boolean {
  const t = strip(term).trim();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(strip(title));
}

export function isTitleExcluded(
  title: string,
  company: string | null,
  exclusions: CompanyTitleExclusion[],
): boolean {
  if (!company) return false;
  const key = company.trim().toLowerCase();
  return exclusions.some(e => e.company.trim().toLowerCase() === key && hasWord(e.term, title));
}
