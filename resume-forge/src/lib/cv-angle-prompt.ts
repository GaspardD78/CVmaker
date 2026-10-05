/**
 * Blocs de prompt des angles de CV (fonctions pures).
 * - `buildAngle` : « Angle imposé » (mode 1 avec un angle choisi, ou passage 2
 *   du mode 2 avec une proposition).
 * - `buildAngleChoice` : « Laisser l'IA choisir parmi ma bibliothèque » ; le
 *   LLM indique son choix et sa raison dans `analyse.angle`.
 * Un angle choisit et ordonne : il n'ajoute aucun fait.
 */
import type { MasterEntry, Profile } from '@/types/profile';
import { existingCategoryOrder, type AngleSpec, type TitleRule } from './cv-angles';
import { displayTitle } from './entry-display';

const q = (v: string): string => `"${v.replace(/"/g, "'")}"`;

/** Règle de titre d'un angle, avec le titre du profil quand il est connu. */
export function angleTitleRule(rule: TitleRule, profileTitle?: string | null): string {
  const own = profileTitle?.trim() ? `« ${profileTitle.trim()} »` : 'le titre du profil';
  const ownBare = profileTitle?.trim() || '{titre du profil}';
  return rule === 'profile'
    ? `${own} tel quel. Aucun autre intitulé.`
    : `« ${ownBare} - {mot-clé de l'annonce} » (ou ${own} tel quel). Aucun autre intitulé.`;
}

/** Politique des anciennes expériences. */
export function olderPolicyRule(policy: AngleSpec['olderPolicy']): string {
  return policy === 'one-line'
    ? 'terminées depuis plus de 5 ans et sans lien avec un indispensable : une ligne (titre, employeur, dates), sans description.'
    : 'suivre les paliers de puces de la règle UNE PAGE (ou de VOLUME).';
}

function entryLines(ids: readonly string[], entries: readonly MasterEntry[]): string {
  const byId = new Map(entries.map(e => [e.id, e] as const));
  const lines = ids
    .map(id => byId.get(id))
    .filter((e): e is MasterEntry => e !== undefined)
    .map(e => `  - ID: ${q(e.id)} | Titre: ${q(displayTitle(e.title, e.subtitle))}`);
  return lines.length > 0 ? lines.join('\n') : '  (aucune)';
}

/** Bloc « Angle imposé ». */
export function buildAngle(angle: AngleSpec, entries: readonly MasterEntry[], profile?: Pick<Profile, 'title'> | null): string {
  const categories = existingCategoryOrder(angle.skillCategoryOrder, entries);
  const lines = [
    `## Angle imposé : ${angle.label}`,
    'Cet angle choisit et ordonne le contenu ; il n\'ajoute aucun fait. Il prime sur les règles générales de sélection et d\'ordre, pas sur l\'anti-invention.',
    `- TITRE : ${angleTitleRule(angle.titleRule, profile?.title)}`,
    `- ACCROCHE, gabarit à créneaux : « ${angle.summaryStructure.trim() || '(libre)'} ». Remplis chaque créneau avec un fait de la source (profil maître, trajectoire du profil). Un créneau sans fait correspondant est omis, jamais inventé.`,
    '- EN TÊTE (`visible: true`, en premier dans "entryOrder", dans cet ordre) :',
    entryLines(angle.leadEntryIds, entries),
    '- MASQUÉES PAR DÉFAUT (`visible: false`). Exception : une entrée qui étaye un indispensable reste visible, et tu la cites alors dans analyse.correspondances.',
    entryLines(angle.hideEntryIds, entries),
    `- CATÉGORIES DE COMPÉTENCES, dans cet ordre : ${categories.length > 0 ? categories.join(', ') : '(ordre libre)'}. Les autres catégories viennent après ou sont masquées selon le budget.`,
    angle.vocabulary.trim() ? `- VOCABULAIRE : ${angle.vocabulary.trim()}` : '',
    `- ANCIENNES EXPÉRIENCES : ${olderPolicyRule(angle.olderPolicy)}`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Fiches résumées des angles de la bibliothèque (choix par l'IA, références du prompt d'angles). */
export function angleCards(angles: readonly AngleSpec[], entries: readonly MasterEntry[], profile?: Pick<Profile, 'title'> | null): string[] {
  return angles.filter(a => a.slug).map(a => {
    const categories = existingCategoryOrder(a.skillCategoryOrder, entries);
    return [
      `### Angle "${a.slug}" : ${a.label}`,
      `- Titre : ${angleTitleRule(a.titleRule, profile?.title)}`,
      `- Accroche (gabarit à créneaux) : « ${a.summaryStructure.trim() || '(libre)'} »`,
      `- En tête : ${a.leadEntryIds.length > 0 ? a.leadEntryIds.map(q).join(', ') : '(aucune)'}`,
      `- Masquées par défaut : ${a.hideEntryIds.length > 0 ? a.hideEntryIds.map(q).join(', ') : '(aucune)'}`,
      `- Catégories de compétences : ${categories.length > 0 ? categories.join(', ') : '(ordre libre)'}`,
      a.vocabulary.trim() ? `- Vocabulaire : ${a.vocabulary.trim()}` : '',
      `- Anciennes expériences : ${olderPolicyRule(a.olderPolicy)}`,
    ].filter(Boolean).join('\n');
  });
}

/** Bloc « choisis l'angle dans ma bibliothèque » (mode 1, choix laissé à l'IA). */
export function buildAngleChoice(angles: readonly AngleSpec[], entries: readonly MasterEntry[], profile?: Pick<Profile, 'title'> | null): string {
  const cards = angleCards(angles, entries, profile);
  return `## Angle à choisir dans ma bibliothèque
Choisis l'angle le plus adapté à l'annonce (d'après analyse.indispensables), indique-le dans analyse.angle ({ "slug", "raison" en une phrase liée aux indispensables}), puis applique-le : titre, accroche, entrées en tête (\`visible: true\`, en premier dans "entryOrder"), entrées masquées par défaut (\`visible: false\` sauf si elles étayent un indispensable cité dans analyse.correspondances), ordre des catégories, vocabulaire, anciennes expériences. Un angle choisit et ordonne, il n'ajoute aucun fait.

${cards.join('\n\n')}`;
}
