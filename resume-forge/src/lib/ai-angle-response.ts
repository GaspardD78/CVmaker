/**
 * Mode 2 des angles de CV, « Proposer selon l'annonce » (passage 1) :
 * `buildAnglePrompt` demande 2 à 3 propositions d'angle pour l'annonce,
 * `parseAnglePropositions` lit et valide la réponse du LLM. La proposition
 * retenue alimente ensuite `buildAngle` (passage 2, prompt du CV).
 */
import type { MasterEntry, Profile } from '@/types/profile';
import { extractJsonObject, parseAnalyse, type AiCvAnalyse } from './ai-cv-response';
import { buildMasterProfile, buildPersonalRules, buildRole, JSON_RULES } from './cv-prompt';
import { angleCards } from './cv-angle-prompt';
import { existingCategoryOrder, normalizeTitleRule, type AngleSpec } from './cv-angles';

/** Nombre de propositions demandées / acceptées. */
export const MIN_PROPOSITIONS = 2;
export const MAX_PROPOSITIONS = 3;
/** Entrées en tête valides minimales pour qu'une proposition soit retenue. */
export const MIN_LEAD_ENTRIES = 2;

export interface AnglePromptInput {
  profile: Profile;
  entries: MasterEntry[];
  jobOfferText: string;
  targetCompany?: string;
  personalRules?: string;
  /** Bibliothèque d'angles (références), résolue d'après les tags. */
  library: AngleSpec[];
}

/** Une proposition d'angle validée (prête pour `buildAngle`). */
export interface AngleProposition extends AngleSpec {
  pourquoi: string;
  sacrifie: string;
  ecarts: string[];
}

export interface AnglePropositions {
  analyse?: AiCvAnalyse;
  propositions: AngleProposition[];
  /** Index dans `propositions` (après validation) ; absent si la recommandation a été rejetée. */
  recommandation?: { index: number; raison: string };
  /** Éléments retirés ou rejetés à la validation (affichés). */
  warnings: string[];
}

export function buildAnglePrompt(input: AnglePromptInput): string {
  const { profile, entries, jobOfferText, targetCompany, personalRules, library } = input;
  const cards = angleCards(library, entries, profile);
  const rules = buildPersonalRules(personalRules);
  return [
    buildRole(),
    `## Objectif
Proposer ${MIN_PROPOSITIONS} à ${MAX_PROPOSITIONS} ANGLES de CV pour cette annonce. Un angle choisit et ordonne le contenu du profil maître (entrées en tête, entrées masquées, ordre des catégories de compétences, structure de l'accroche) ; il n'ajoute aucun fait. Le CV sera généré dans un second temps avec l'angle retenu.`,
    `## Contexte
${targetCompany ? `Entreprise cible : ${targetCompany}\n` : ''}Annonce :
<<<
${jobOfferText.trim()}
>>>`,
    buildMasterProfile(entries, profile, { angleTags: true }),
    `## Ma bibliothèque d'angles (références)
Une proposition peut reprendre un angle existant (son "slug") en l'ajustant, ou en proposer un nouveau ("slug": null).

${cards.length > 0 ? cards.join('\n\n') : '(vide)'}`,
    rules,
    `## Contraintes
- Analyse d'abord l'annonce ("analyse") : indispensables et importants en formulation exacte, correspondances (ID de l'entrée qui étaye chaque indispensable, ou null), écarts.${rules ? ' Renseigne "alertes_cap" si l\'annonce contredit un critère de recherche des règles personnelles.' : ''}
- ${MIN_PROPOSITIONS} à ${MAX_PROPOSITIONS} propositions au maximum, nettement différentes : jamais deux angles quasi identiques.
- Aucune proposition ne présente un intitulé de poste non tenu. "titleRule" vaut "profile" (titre du profil tel quel) ou "profile+keyword" (titre du profil suivi d'un mot-clé de l'annonce).
- "summaryStructure" est un gabarit à créneaux entre accolades (« {intitulé} depuis {année}, … »), jamais du texte final.
- "leadEntryIds" (au moins ${MIN_LEAD_ENTRIES}) et "hideEntryIds" ne contiennent que des IDs exacts du profil maître, sans recoupement. Aucune entrée qui étaye un indispensable ne figure dans "hideEntryIds".
- "skillCategoryOrder" ne contient que des titres exacts de catégories de compétences existantes.
- "sacrifie" dit ce que l'angle laisse de côté ; "ecarts" liste les indispensables qu'il ne couvre pas.
- "recommandation" désigne l'index (à partir de 0) de la proposition la plus adaptée, avec sa raison en une phrase.`,
    `## Format de sortie OBLIGATOIRE
${JSON_RULES}

{
  "schemaVersion": 1,
  "analyse": {
    "langue_annonce": "fr",
    "indispensables": ["(formulation exacte)"],
    "importants": ["(formulation exacte)"],
    "correspondances": [{ "exigence": "(un indispensable)", "entryId": "(ID ou null)" }],
    "ecarts": ["(indispensable sans preuve)"],
    "alertes_cap": ["(optionnel) critère éliminatoire contredit par l'annonce"]
  },
  "propositions": [
    {
      "slug": "(slug d'un angle de la bibliothèque, ou null pour un angle nouveau)",
      "label": "(nom court)",
      "pourquoi": "(une phrase, liée à des indispensables)",
      "titleRule": "profile | profile+keyword",
      "summaryStructure": "(gabarit à créneaux)",
      "leadEntryIds": ["(IDs exacts)"],
      "hideEntryIds": ["(IDs exacts)"],
      "skillCategoryOrder": ["(titres exacts de catégories existantes)"],
      "sacrifie": "(ce que cet angle laisse de côté)",
      "ecarts": ["(indispensables que cet angle ne couvre pas)"]
    }
  ],
  "recommandation": { "index": 0, "raison": "(une phrase)" }
}`,
  ].filter(Boolean).join('\n\n');
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(str).filter(Boolean))] : [];

export interface AngleParseContext {
  entries: readonly MasterEntry[];
  /** Slugs de la bibliothèque : un slug inconnu devient `null` (angle nouveau). */
  librarySlugs?: readonly string[];
}

/**
 * Lit la réponse du passage 1 (tolère bloc de code et texte autour) et la
 * valide : IDs existants, au plus 3 propositions, entrées en tête et masquées
 * disjointes, aucune entrée masquée qui étaye un indispensable, catégories
 * existantes. Les éléments invalides sont retirés (avertissement) ; une
 * proposition avec moins de 2 entrées en tête valides est rejetée.
 * @throws {SyntaxError} JSON introuvable, plus de 3 propositions, ou aucune proposition valide.
 */
export function parseAnglePropositions(raw: string, ctx: AngleParseContext): AnglePropositions {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const extracted = extractJsonObject(cleaned);
    if (extracted === null) throw new SyntaxError('JSON invalide');
    parsed = JSON.parse(extracted);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError('La réponse doit être un objet JSON');
  const obj = parsed as Record<string, unknown>;
  const rawList = Array.isArray(obj.propositions) ? obj.propositions : [];
  if (rawList.length > MAX_PROPOSITIONS) {
    throw new SyntaxError(`${rawList.length} propositions : ${MAX_PROPOSITIONS} au maximum. Relancez l'analyse.`);
  }

  const analyse = parseAnalyse(obj.analyse);
  const entryById = new Map(ctx.entries.map(e => [e.id, e] as const));
  const cited = new Set((analyse?.correspondances ?? []).map(c => c.entryId).filter((id): id is string => id !== null));
  const warnings: string[] = [];
  const propositions: AngleProposition[] = [];
  const newIndex = new Map<number, number>();

  rawList.forEach((item, i) => {
    const r = (item ?? {}) as Record<string, unknown>;
    const label = str(r.label) || `Proposition ${i + 1}`;
    const known = (ids: string[], what: string): string[] => {
      const unknown = ids.filter(id => !entryById.has(id));
      if (unknown.length > 0) warnings.push(`« ${label} » : ID inconnu(s) retiré(s) des ${what} : ${unknown.join(', ')}.`);
      return ids.filter(id => entryById.has(id));
    };
    const leadEntryIds = known(strList(r.leadEntryIds), 'entrées en tête');
    let hideEntryIds = known(strList(r.hideEntryIds), 'entrées masquées');
    const overlap = hideEntryIds.filter(id => leadEntryIds.includes(id));
    if (overlap.length > 0) {
      warnings.push(`« ${label} » : ${overlap.length} entrée(s) à la fois en tête et masquée(s) : gardée(s) en tête.`);
      hideEntryIds = hideEntryIds.filter(id => !overlap.includes(id));
    }
    const needed = hideEntryIds.filter(id => cited.has(id));
    if (needed.length > 0) {
      warnings.push(`« ${label} » : ${needed.map(id => `« ${entryById.get(id)!.title} »`).join(', ')} étaye(nt) un indispensable : non masquée(s).`);
      hideEntryIds = hideEntryIds.filter(id => !needed.includes(id));
    }
    const askedCategories = strList(r.skillCategoryOrder);
    const skillCategoryOrder = existingCategoryOrder(askedCategories, ctx.entries);
    if (skillCategoryOrder.length < askedCategories.length) {
      warnings.push(`« ${label} » : catégorie(s) inexistante(s) ignorée(s).`);
    }
    if (leadEntryIds.length < MIN_LEAD_ENTRIES) {
      warnings.push(`« ${label} » rejetée : moins de ${MIN_LEAD_ENTRIES} entrées en tête valides.`);
      return;
    }
    const slug = str(r.slug);
    newIndex.set(i, propositions.length);
    propositions.push({
      slug: slug && (ctx.librarySlugs ?? []).includes(slug) ? slug : null,
      label,
      pourquoi: str(r.pourquoi),
      titleRule: normalizeTitleRule(r.titleRule),
      summaryStructure: str(r.summaryStructure),
      skillCategoryOrder,
      vocabulary: '',
      olderPolicy: 'one-line',
      leadEntryIds,
      hideEntryIds,
      sacrifie: str(r.sacrifie),
      ecarts: strList(r.ecarts),
    });
  });

  if (propositions.length === 0) throw new SyntaxError('Aucune proposition valide. Relancez l\'analyse.');
  if (propositions.length < MIN_PROPOSITIONS) warnings.push(`Une seule proposition valide (${MIN_PROPOSITIONS} à ${MAX_PROPOSITIONS} attendues).`);

  const result: AnglePropositions = { propositions, warnings };
  if (analyse) result.analyse = analyse;
  const rec = (obj.recommandation ?? null) as Record<string, unknown> | null;
  if (rec && typeof rec.index === 'number') {
    const idx = newIndex.get(rec.index);
    if (idx !== undefined) result.recommandation = { index: idx, raison: str(rec.raison) };
    else warnings.push('La proposition recommandée a été rejetée.');
  }
  return result;
}
