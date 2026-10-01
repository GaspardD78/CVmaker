/**
 * Mise en forme des dates d'une entrée de CV, centralisée.
 *
 * Deux réglages du CV (`cv.settings`, lus par `readDateSettings`) :
 * - `dateFormat` : `"year"` n'affiche que les années ; toute autre valeur ou
 *   l'absence de la clé garde le mode historique « mois et année » ;
 * - `showEducationYears` : `false` masque toutes les dates des entrées de type
 *   `education` (surcharge `datesOverride` comprise) ; toute autre valeur ou
 *   l'absence de la clé les affiche.
 *
 * Mode « mois et année » : comportement historique inchangé, y compris sa
 * lecture via `Date` (décalage d'un mois, ou d'une année en janvier, dans un
 * fuseau à décalage négatif : NOTES.md §3). Mode « année » : l'année est lue
 * dans la chaîne (`AAAA-MM`, `AAAA`…), donc indépendante du fuseau.
 *
 * `datesOverride` (texte libre de l'utilisateur ou du générateur de CV par IA)
 * est affiché tel quel dans les deux modes, sauf formation masquée.
 */

export type DateFormat = 'month-year' | 'year';

export interface DateSettings {
  dateFormat: DateFormat;
  showEducationYears: boolean;
}

export const DEFAULT_DATE_SETTINGS: DateSettings = { dateFormat: 'month-year', showEducationYears: true };

/** Lit les réglages de dates d'un CV ; toute valeur inattendue (sauvegarde importée…) retombe sur le défaut. */
export function readDateSettings(settings: Record<string, unknown> | null | undefined): DateSettings {
  const s = settings ?? {};
  return {
    dateFormat: s.dateFormat === 'year' ? 'year' : 'month-year',
    showEducationYears: s.showEducationYears === false || s.showEducationYears === 'false' ? false : true,
  };
}

/** Champs d'une entrée qui entrent dans la date affichée. */
export interface EntryDateFields {
  entryType: string;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean | null;
}

export interface FormatEntryDatesOptions {
  /**
   * Entrée datée sans date de fin et pas « en cours » : `'omit'` (PDF) n'affiche
   * que le début ; `'today'` (DOCX, comportement historique) ajoute « Aujourd'hui ».
   */
  missingEnd?: 'omit' | 'today';
}

const CURRENT_LABEL = 'Présent';
const TODAY_LABEL = "Aujourd'hui";

/** Mois et année (historique) : lecture via Date, sensible au fuseau. */
function monthYear(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
}

/** Année seule (historique, formations et certifications) : lecture via Date, sensible au fuseau. */
function legacyYear(dateString: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('fr-FR', { year: 'numeric' }).format(date);
}

/**
 * Année d'une date `AAAA…` lue dans la chaîne (indépendante du fuseau) ; une
 * chaîne qui ne commence pas par quatre chiffres suit la lecture historique.
 */
export function yearOf(dateString: string): string {
  const m = /^\s*(\d{4})(?!\d)/.exec(dateString);
  return m ? m[1] : legacyYear(dateString);
}

/**
 * Texte de la date d'une entrée, ou chaîne vide quand rien ne s'affiche
 * (pas de date, ou années de formation masquées).
 */
export function formatEntryDates(
  entry: EntryDateFields,
  datesOverride: unknown,
  settings: DateSettings,
  options: FormatEntryDatesOptions = {},
): string {
  if (entry.entryType === 'education' && !settings.showEducationYears) return '';

  const override = typeof datesOverride === 'string' ? datesOverride.trim() : '';
  if (override) return override;

  const yearMode = settings.dateFormat === 'year';
  const yearOnly = entry.entryType === 'education' || entry.entryType === 'certification';
  const fmt = yearMode ? yearOf : yearOnly ? legacyYear : monthYear;

  const start = entry.startDate ? fmt(entry.startDate) : '';
  const end = entry.endDate ? fmt(entry.endDate) : '';
  const endText = entry.isCurrent
    ? CURRENT_LABEL
    : end || (start && options.missingEnd === 'today' ? TODAY_LABEL : '');

  if (!start) return endText;
  if (!endText) return start;
  // Période contenue dans une seule année : « 2023 », pas « 2023 - 2023 ».
  if (yearMode && !entry.isCurrent && endText === start) return start;
  return `${start} - ${endText}`;
}
