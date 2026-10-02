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
 * Les dates d'un CV (`AAAA`, `AAAA-MM`, `AAAA-MM-JJ`) sont des jalons, pas des
 * instants : mois et année sont lus dans la chaîne, jamais via `Date`, donc le
 * résultat ne dépend ni du fuseau de la machine ni du moteur JavaScript (une
 * date ISO sans heure est lue en UTC par `Date`, puis affichée en heure locale :
 * elle reculait d'un mois, d'une année en janvier, dans un fuseau négatif ;
 * NOTES.md §18). Une chaîne d'un autre format retombe sur la lecture via `Date`
 * (heure locale, sans décalage).
 *
 * `datesOverride` (texte libre de l'utilisateur ou du générateur de CV par IA)
 * est affiché tel quel dans les deux modes, sauf formation masquée.
 */

import { DEFAULT_CV_LANGUAGE, presentLabel, readCvLanguage, todayLabel } from './cv-language';

export type DateFormat = 'month-year' | 'year';

export interface DateSettings {
  dateFormat: DateFormat;
  showEducationYears: boolean;
  /** Langue du CV (code ISO 639-1, `cv.settings.cvLanguage`) : mois et « Présent ». Absente : `fr`. */
  language?: string;
}

export const DEFAULT_DATE_SETTINGS: DateSettings = { dateFormat: 'month-year', showEducationYears: true, language: DEFAULT_CV_LANGUAGE };

/** Lit les réglages de dates d'un CV ; toute valeur inattendue (sauvegarde importée…) retombe sur le défaut. */
export function readDateSettings(settings: Record<string, unknown> | null | undefined): DateSettings {
  const s = settings ?? {};
  return {
    dateFormat: s.dateFormat === 'year' ? 'year' : 'month-year',
    showEducationYears: s.showEducationYears === false || s.showEducationYears === 'false' ? false : true,
    language: readCvLanguage(s),
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

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** `AAAA`, `AAAA-M`, `AAAA-MM`, `AAAA-MM-JJ`, avec heure facultative (lue telle quelle, sans conversion). */
const ISO_DATE = /^\s*(\d{4})(?:-(\d{1,2})(?:-\d{1,2})?)?(?:[T ]\d{1,2}:\d{2}.*)?\s*$/;

/** Nom du mois (1 à 12) dans `language` : table française historique, `Intl` pour les autres langues. */
function monthName(month: number, language: string): string {
  if (language === 'fr') return MONTHS_FR[month - 1];
  return new Intl.DateTimeFormat(language, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month - 1, 1)));
}

/** Format « mois année » d'une chaîne qui n'est pas une date ISO : lecture via Date (heure locale). */
function fallbackMonthYear(dateString: string, language: string): string {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' }).format(date);
}

/**
 * « mars 2020 » pour `2020-03` (mois lu dans la chaîne, indépendant du fuseau).
 * Une année seule (`2020`) donne « janvier 2020 », comme avant ; un mois hors de
 * 1 à 12 ou un autre format suit la lecture via Date.
 */
export function formatMonthYear(dateString: string, languageArg: string = DEFAULT_CV_LANGUAGE): string {
  // `array.map(formatMonthYear)` passe l'index en 2e argument : toute valeur non textuelle retombe sur le français.
  const language = typeof languageArg === 'string' ? languageArg : DEFAULT_CV_LANGUAGE;
  const m = ISO_DATE.exec(dateString);
  if (m) {
    const month = m[2] === undefined ? 1 : parseInt(m[2], 10);
    if (month >= 1 && month <= 12) {
      const name = monthName(month, language);
      return `${name} ${m[1]}`;
    }
  }
  return fallbackMonthYear(dateString, language);
}

/** Année seule d'une chaîne qui n'est pas lisible dans le texte : lecture via Date (heure locale). */
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

  const yearOnly = settings.dateFormat === 'year' || entry.entryType === 'education' || entry.entryType === 'certification';
  const fmt = yearOnly ? yearOf : (d: string) => formatMonthYear(d, settings.language ?? DEFAULT_CV_LANGUAGE);

  const start = entry.startDate ? fmt(entry.startDate) : '';
  const end = entry.endDate ? fmt(entry.endDate) : '';
  const endText = entry.isCurrent
    ? presentLabel(settings.language ?? DEFAULT_CV_LANGUAGE)
    : end || (start && options.missingEnd === 'today' ? todayLabel(settings.language ?? DEFAULT_CV_LANGUAGE) : '');

  if (!start) return endText;
  if (!endText) return start;
  // Période contenue dans une seule année : « 2023 », pas « 2023 - 2023 ».
  if (settings.dateFormat === 'year' && !entry.isCurrent && endText === start) return start;
  return `${start} - ${endText}`;
}
