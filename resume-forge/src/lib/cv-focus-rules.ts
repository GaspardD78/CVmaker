import { applyWording, type Wording } from './cv-wording';

/**
 * Orientation du CV : « missions et périmètre » (défaut) ou « volumes et résultats ».
 *
 * Tout le texte de prompt qui dépend de l'orientation est ici, et seulement ici
 * (un test échoue si une consigne de quantification réapparaît ailleurs). Le mode
 * `resultats` reproduit à l'identique les consignes historiques.
 */

export type BulletFocus = 'missions' | 'resultats';

export const DEFAULT_BULLET_FOCUS: BulletFocus = 'missions';

export const BULLET_FOCUS_OPTIONS: readonly { value: BulletFocus; label: string; help: string }[] = [
  { value: 'missions', label: 'Missions et périmètre', help: 'Le CV explique ce que vous faisiez et sur quel périmètre. Peu de chiffres.' },
  { value: 'resultats', label: 'Résultats chiffrés', help: 'Le CV met en avant volumes et résultats. Adapté aux cabinets et ESN.' },
];

/** Clé `settings` du réglage par profil (voir `profileSettingKey`). */
export const BULLET_FOCUS_SETTING = 'cv_bullet_focus';

export function normalizeBulletFocus(raw: unknown): BulletFocus | undefined {
  return raw === 'missions' || raw === 'resultats' ? raw : undefined;
}

/**
 * Orientation effective : réglage du CV (`cv.settings.bulletFocus`) > réglage du
 * profil > défaut de la cible (ciblage par type de structure) > `missions`.
 */
export function resolveBulletFocus(
  cvSettings: Record<string, unknown> | null | undefined,
  profileSetting: string | null | undefined,
  targetDefault?: BulletFocus,
): BulletFocus {
  return normalizeBulletFocus(cvSettings?.bulletFocus)
    ?? normalizeBulletFocus(profileSetting)
    ?? targetDefault
    ?? DEFAULT_BULLET_FOCUS;
}

export interface FocusRuleOptions {
  onePage?: boolean;
  /** Langue du CV (`cv.settings.cvLanguage`) : le bloc « missions » est rédigé en anglais pour `en`. */
  language?: string;
  mode?: Wording;
}


// ── Fragments utilisés par cv-prompt.ts, prompt-templates.ts et les modèles ──

/** Forme d'une puce (le temps des verbes est une règle indépendante). */
export function bulletShape(focus: BulletFocus): string {
  return focus === 'missions'
    ? "Puce = verbe d'action + quoi + pour qui ou sur quel périmètre + comment. Un résultat n'est ajouté que s'il éclaire la mission."
    : "Puce = verbe d'action + quoi + outil ou méthode + résultat. Le résultat n'apparaît que s'il figure dans la source.";
}

/** Règle du gras dans les descriptions du CV. */
export function cvBoldRule(focus: BulletFocus): string {
  return focus === 'missions'
    ? '- Pas de gras (**). Aucun autre markdown que les puces « - ».'
    : '- Gras (**) autorisé uniquement sur des technologies ou des résultats chiffrés présents dans la source, 2 par puce au maximum. Aucun autre markdown que les puces « - ».';
}

/** Règle du gras des textes libres (lettres, messages, analyses). */
export function textBoldRule(focus: BulletFocus): string {
  return focus === 'missions'
    ? '- Mettre en **gras** les termes-clés (technologies, certifications)'
    : '- Mettre en **gras** les termes-clés (technologies, certifications, métriques chiffrées)';
}

/** Éléments de preuve de l'accroche. */
export function summaryProofs(focus: BulletFocus): string {
  return focus === 'missions'
    ? '2 éléments de périmètre ou de mission reliés aux indispensables'
    : '2 preuves reliées aux indispensables';
}

/** Phrase de l'accroche selon la séniorité. */
export function summarySeniorRule(focus: BulletFocus): string {
  return focus === 'missions'
    ? 'Profil senior : périmètre, pilotage, autonomie. Profil junior : projets, certifications, stack.'
    : 'Profil senior : périmètre, pilotage, résultats. Profil junior : projets, certifications, stack.';
}

/** Consigne sur les chiffres de la source dans la règle PUCES. */
export function numbersRule(focus: BulletFocus): string {
  return focus === 'missions'
    ? "N'invente aucun chiffre ; tu peux en omettre."
    : "Conserve tous les chiffres de la source, n'en ajoute aucun.";
}

/** Consigne `warnings` de l'anti-invention. */
export function warningsRule(focus: BulletFocus): string {
  return focus === 'missions'
    ? "- Si le périmètre d'une expérience reste flou, ne le devine pas : ajoute dans \"warnings\" une question sur le périmètre à mon intention (ex. « Poste X : quels profils, quels interlocuteurs ? »)."
    : "- Si une puce manque de résultat chiffré, ne l'invente pas : ajoute dans \"warnings\" une question de quantification à mon intention (ex. « Poste X : combien d'utilisateurs ou d'alertes par jour ? »).";
}

/** Exemple de description du schéma JSON (les `\n` sont littéraux : le JSON les attend échappés). */
export function schemaDescriptionExample(focus: BulletFocus): string {
  return focus === 'missions'
    ? "- verbe d'action + quoi + périmètre + méthode\\n- puce suivante"
    : "- verbe d'action + quoi + outil + résultat sourcé\\n- puce suivante";
}

/** Description du champ `warnings` du schéma JSON. */
export function schemaWarningsHint(focus: BulletFocus): string {
  return focus === 'missions'
    ? '(optionnel) périmètres à préciser, points à vérifier'
    : '(optionnel) questions de quantification, points à vérifier';
}

/** Titre du bloc `warnings` dans le rapport du garde-fou ; `null` : aucun titre (affichage historique). */
export function warningsLabel(focus: BulletFocus | undefined): string | null {
  return focus === 'missions' ? 'Périmètres à préciser' : null;
}

/** Axe de précision du dialogue d'enrichissement du profil maître. */
export function enrichPrecisionRule(focus: BulletFocus): string {
  return focus === 'missions'
    ? '- **PRÉCISION** : Cherche d\'abord le périmètre ("Quels profils ? Pour quels interlocuteurs ? Sur quelles étapes ? Seul ou en équipe ?"), puis le "Comment ?" (méthodes) et le "Avec quoi ?" (outils). Les chiffres viennent en dernier, sans insister : le profil maître peut les garder, c\'est la génération du CV qui choisit de les omettre.'
    : '- **PRÉCISION** : Cherche toujours le "Combien ?" (chiffres), le "Comment ?" (méthodes) et le "Avec quoi ?" (outils).';
}

/** Étape ENRICHISSEMENT de la mission d'enrichissement du profil maître. */
export function enrichStepRule(focus: BulletFocus): string {
  return focus === 'missions'
    ? '5. **ENRICHISSEMENT** : Identifie les entrées dont le périmètre reste flou (profils, interlocuteurs, étapes, autonomie) ou qui manquent de méthodes et d\'outils, et enrichis-les via le dialogue, en commençant par l\'expérience la plus stratégique.'
    : '5. **ENRICHISSEMENT** : Identifie les entrées qui manquent de "preuves" (résultats concrets, chiffres, outils) et enrichis-les via le dialogue, en commençant par l\'expérience la plus stratégique.';
}

/** Ligne d'exemple du modèle Markdown de départ (neutre : décrit un périmètre). */
export const MARKDOWN_BULLET_EXAMPLE = '[Mission et périmètre : pour qui, sur quel domaine, avec quelle méthode]';

// ── Bloc « Orientation » du prompt CV ────────────────────────────────────────

const MISSIONS_FR = `### Orientation : périmètre et missions
- PRIORITÉ : le CV explique ce que le candidat faisait et sur quel périmètre. Les résultats chiffrés sont secondaires.
- Pour chaque expérience, la première puce décrit le périmètre : types de profils recrutés, interlocuteurs (direction, managers, practice leads), étendue géographique, étapes du processus prises en charge, autonomie (seul, en binôme, en équipe).
- Les puces suivantes décrivent les missions et la manière de faire : méthodes, outils, responsabilités confiées, projets menés.
- PUCE = verbe d'action + quoi + pour qui ou sur quel périmètre + comment. Un résultat n'est ajouté que s'il éclaire la mission.
- CHIFFRES : 3 au maximum sur tout le CV, hors années d'expérience, choisis parmi ceux qui décrivent le mieux le périmètre (taille d'équipe, nombre de sites, effectif accompagné) plutôt que les volumes de recrutement. Les autres chiffres de la source sont omis : les omettre n'est pas une invention.
- ACCROCHE : métier, années d'expérience, périmètre type (profils, interlocuteurs, étapes), puis ce qui distingue le candidat. Aucun chiffre en dehors des années d'expérience.
- GRAS : aucun.
- WARNINGS : ne pose aucune question de quantification. Signale à la place une expérience dont le périmètre reste flou (ex. « Poste X : quels profils, quels interlocuteurs ? »).`;

const MISSIONS_EN = `### Focus: scope and responsibilities
- PRIORITY: the CV explains what the candidate actually did and on what scope. Quantified results are secondary.
- For each experience, the first bullet describes the scope: types of profiles hired, stakeholders (leadership, managers, practice leads), geographic reach, stages of the process covered, autonomy (alone, in a pair, in a team).
- The following bullets describe the missions and the way of working: methods, tools, responsibilities entrusted, projects led.
- BULLET = action verb + what + for whom or on what scope + how. A result is added only if it clarifies the mission.
- NUMBERS: 3 at most across the whole CV, excluding years of experience, chosen among those that best describe the scope (team size, number of sites, headcount supported) rather than hiring volumes. The other numbers in the source are left out: leaving them out is not an invention.
- SUMMARY: profession, years of experience, typical scope (profiles, stakeholders, stages), then what sets the candidate apart. No number other than years of experience.
- BOLD: none.
- WARNINGS: do not ask any quantification question. Instead, flag an experience whose scope remains unclear (e.g. "Role X: which profiles, which stakeholders?").`;

const ONE_PAGE_FR = "- UNE PAGE : le périmètre tient dans la première puce ; les puces suivantes ne gardent que les missions les plus liées aux indispensables.";
const ONE_PAGE_EN = '- ONE PAGE: the scope fits in the first bullet; the following bullets keep only the missions most tied to the must-haves.';

/**
 * Bloc « Orientation » inséré dans les règles de contenu du prompt CV. Vide pour
 * `resultats` : les consignes historiques sont déjà dans les règles.
 */
export function buildFocusRules(focus: BulletFocus, opts: FocusRuleOptions = {}): string {
  if (focus !== 'missions') return '';
  const en = opts.language === 'en';
  const base = en ? MISSIONS_EN : MISSIONS_FR;
  const text = opts.onePage ? `${base}\n${en ? ONE_PAGE_EN : ONE_PAGE_FR}` : base;
  return applyWording(text, opts.mode);
}
