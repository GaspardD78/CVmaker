/**
 * Langue du CV : codes, libellés de sections, noms de langues et niveaux.
 *
 * La langue du CV vit dans `cv.settings.cvLanguage` (code ISO 639-1, défaut
 * `fr`). Elle pilote les dates (mois, « Présent »), les libellés de sections
 * par défaut et la traduction des entrées de type langue. Les contenus rédigés
 * par l'IA sont déjà dans la langue cible (consigne du prompt).
 */
import { normalizeLabel } from './cv-sections';

export const DEFAULT_CV_LANGUAGE = 'fr';

/** Noms de langues (formes normalisées) reconnus, par code ISO. */
const LANGUAGE_ALIASES: Record<string, string[]> = {
  fr: ['francais', 'french', 'francese', 'frances', 'franzosisch'],
  en: ['anglais', 'english', 'ingles', 'inglese', 'englisch'],
  de: ['allemand', 'german', 'deutsch', 'aleman', 'tedesco'],
  es: ['espagnol', 'spanish', 'espanol', 'castellano', 'spagnolo'],
  it: ['italien', 'italian', 'italiano'],
  pt: ['portugais', 'portuguese', 'portugues', 'portoghese'],
  nl: ['neerlandais', 'dutch', 'nederlands', 'hollandais'],
  ar: ['arabe', 'arabic'],
  zh: ['chinois', 'chinese', 'mandarin'],
  ja: ['japonais', 'japanese'],
  ru: ['russe', 'russian'],
};

/** Code ISO 639-1 d'une valeur libre (`fr`, `FR`, `en-US`, `anglais`, `English`…) ; `undefined` si inconnue. */
export function normalizeLanguageCode(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = normalizeLabel(raw);
  if (!value) return undefined;
  const code = /^([a-z]{2})(?:[-_][a-z0-9]+)?$/.exec(value);
  if (code && code[1] in LANGUAGE_ALIASES) return code[1];
  for (const [iso, names] of Object.entries(LANGUAGE_ALIASES)) {
    if (names.includes(value)) return iso;
  }
  return undefined;
}

/** Code de la langue désignée par le titre d'une entrée de type langue (« Anglais », « Anglais (courant) »…). */
export function languageCodeOfTitle(title: string): string | undefined {
  const words = normalizeLabel(title).split(/[^a-z]+/).filter(Boolean);
  for (const word of words) {
    const code = normalizeLanguageCode(word);
    if (code) return code;
  }
  return undefined;
}

/** Lit `cv.settings.cvLanguage` ; toute valeur inattendue retombe sur le français. */
export function readCvLanguage(settings: Record<string, unknown> | null | undefined): string {
  return normalizeLanguageCode(settings?.cvLanguage) ?? DEFAULT_CV_LANGUAGE;
}

// ── Libellés de sections ─────────────────────────────────────────────────────

/** Libellés standard (clé = forme française de `createCv`) par langue. */
const SECTION_LABELS: Record<string, Record<string, string>> = {
  en: {
    'experiences professionnelles': 'Professional Experience',
    formations: 'Education',
    competences: 'Skills',
    certifications: 'Certifications',
    langues: 'Languages',
    projets: 'Projects',
    "centres d'interet": 'Interests',
    benevolat: 'Volunteering',
  },
};

/** Libellé standard d'une section dans `language`, ou `undefined` (langue ou section non couverte). */
export function defaultSectionLabel(sectionKey: string, language: string): string | undefined {
  return SECTION_LABELS[language]?.[normalizeLabel(sectionKey)];
}

// ── Noms de langues et niveaux (fr <-> en) ───────────────────────────────────

const LANGUAGE_LABEL_PAIRS: ReadonlyArray<readonly [fr: string, en: string]> = [
  ['Français', 'French'], ['Anglais', 'English'], ['Allemand', 'German'], ['Espagnol', 'Spanish'],
  ['Italien', 'Italian'], ['Portugais', 'Portuguese'], ['Néerlandais', 'Dutch'], ['Arabe', 'Arabic'],
  ['Chinois', 'Chinese'], ['Japonais', 'Japanese'], ['Russe', 'Russian'],
  ['Langue maternelle', 'Native'], ['Natif', 'Native'], ['Bilingue', 'Bilingual'], ['Courant', 'Fluent'],
  ['Professionnel', 'Professional'], ['Intermédiaire', 'Intermediate'], ['Avancé', 'Advanced'],
  ['Notions', 'Basic'], ['Débutant', 'Beginner'], ['Scolaire', 'Basic'],
];

function labelTable(target: 'fr' | 'en'): Map<string, string> {
  const table = new Map<string, string>();
  for (const [fr, en] of LANGUAGE_LABEL_PAIRS) {
    const from = target === 'en' ? fr : en;
    const to = target === 'en' ? en : fr;
    const key = normalizeLabel(from);
    if (!table.has(key)) table.set(key, to);
  }
  return table;
}
const TO_EN = labelTable('en');
const TO_FR = labelTable('fr');

/**
 * Traduit les segments connus (nom de langue, niveau) d'un libellé comme
 * « Courant - C1 » vers `target` (`fr` ou `en`). Les segments inconnus (codes
 * CECRL, texte libre) sont conservés tels quels. Retourne `undefined` quand
 * rien n'a changé (ou pour une langue cible non gérée).
 */
export function translateLanguageLabel(text: string, target: string): string | undefined {
  if (target !== 'fr' && target !== 'en') return undefined;
  const table = target === 'en' ? TO_EN : TO_FR;
  let changed = false;
  const out = text.replace(/[^\s\-–,/()]+(?: [^\s\-–,/()]+)*/g, segment => {
    const hit = table.get(normalizeLabel(segment));
    if (hit === undefined) return segment;
    changed = true;
    return hit;
  });
  return changed ? out : undefined;
}

// ── Dates : mois et mot « présent » ──────────────────────────────────────────

const PRESENT_LABELS: Record<string, string> = {
  fr: 'Présent', en: 'Present', de: 'Heute', es: 'Actualidad', it: 'Presente', nl: 'Heden', pt: 'Presente',
};
const TODAY_LABELS: Record<string, string> = {
  fr: "Aujourd'hui", en: 'Today', de: 'Heute', es: 'Hoy', it: 'Oggi', nl: 'Vandaag', pt: 'Hoje',
};

export function presentLabel(language: string): string {
  return PRESENT_LABELS[language] ?? PRESENT_LABELS.en;
}

export function todayLabel(language: string): string {
  return TODAY_LABELS[language] ?? TODAY_LABELS.en;
}

// ── Pertinence de la section « Langues » ─────────────────────────────────────

export interface LanguageEntryInfo {
  id: string;
  /** Titre de l'entrée (« Anglais »). */
  title: string;
  /** Niveau renseigné (« Courant - C1 »), `null` si absent. */
  level: string | null;
  /** Entrée laissée visible par l'IA (défaut : oui). Seules les visibles comptent pour la règle (b). */
  visible?: boolean;
}

export interface LanguageDecision {
  /** La section Langues doit-elle être affichée ? */
  show: boolean;
  /** Entrées à rendre visibles quoi qu'ait décidé l'IA (langues exigées par l'annonce). */
  forceVisibleIds: string[];
  /** Entrée de la langue de l'annonce, à placer en premier. */
  frontId?: string;
}

/** `true` quand `text` (déjà normalisé) nomme la langue `code`. */
function mentionsLanguage(normalizedText: string, code: string): boolean {
  return (LANGUAGE_ALIASES[code] ?? []).some(name => new RegExp(`(^|[^a-z])${name}($|[^a-z])`).test(normalizedText));
}

const GENERIC_LANGUAGE_REQUIREMENT = /(^|[^a-z])(bilingue|bilingual|multilingue|multilingual|langues? etrangeres?|foreign languages?)($|[^a-z])/;

/**
 * Règle de pertinence de la section Langues (déterministe, après la réponse de
 * l'IA) : visible seulement si (a) l'annonce l'exige (une langue du profil ou
 * une exigence générique de type « bilingue » figure parmi les exigences), ou
 * (b) au moins une langue autre que celle du CV est renseignée avec un niveau.
 * La langue de l'annonce (= celle du CV) passe en premier. L'exigence (a) porte
 * sur toutes les langues du profil, même masquées par l'IA ; la règle (b) ne
 * compte que celles qu'elle a laissées visibles.
 */
export function decideLanguageSection(
  languages: readonly LanguageEntryInfo[],
  cvLanguage: string,
  adRequirements: readonly string[],
): LanguageDecision {
  const adText = normalizeLabel(adRequirements.join(' \n '));
  const withCode = languages.map(l => ({ ...l, code: languageCodeOfTitle(l.title) }));

  const required = withCode.filter(l => l.code !== undefined && mentionsLanguage(adText, l.code));
  const genericRequirement = GENERIC_LANGUAGE_REQUIREMENT.test(adText);
  const otherWithLevel = withCode.some(l => l.visible !== false && l.code !== cvLanguage && Boolean(l.level?.trim()));

  const show = required.length > 0 || genericRequirement || otherWithLevel;
  const front = withCode.find(l => l.code === cvLanguage);
  return {
    show,
    forceVisibleIds: required.map(l => l.id),
    frontId: show ? front?.id : undefined,
  };
}
