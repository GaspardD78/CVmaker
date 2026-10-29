import type { AiCvResponse, SkillGroupPlan } from './ai-cv-response';
import { aiEntryToOverrideData, planCvBlockOrder } from './ai-cv-response';
import { isSectionHeader, isSubHeader, normalizeLabel } from './cv-sections';
import { isSkillCategory } from './skill-lines';
import { MIN_SKILL_LINES } from './ai-cv-guard';
import { remapEntryOrder, resolveMergedGroup, type ResolvedMerge } from './merged-entries';
import {
  decideLanguageSection,
  defaultSectionLabel,
  normalizeLanguageCode,
  readCvLanguage,
  translateLanguageLabel,
} from './cv-language';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import type { CVBlock } from '@/types/cv';
import type { MasterEntry, Profile } from '@/types/profile';
import { headerSettingsPatch } from './header-extras';
import { buildTargetSnapshot, reconcileAiTarget, type TargetAxis, type TargetContradiction } from './cv-target-snapshot';
import type { ResolvedTarget, SheetOverrides } from './cv-targets';

/** Sous-ensemble du store CV utilisé ici (injectable pour les tests, sans base de données). */
export interface CvBlockPort {
  currentCvBlocks: CVBlock[];
  fetchCvBlocks: (cvId: string) => Promise<void>;
  updateCvBlock: (id: string, updates: Partial<CVBlock>) => Promise<void>;
  createCvBlock: (block: Omit<CVBlock, 'id' | 'createdAt'>) => Promise<void>;
  deleteCvBlock: (id: string) => Promise<void>;
  reorderCvBlocks: (cvId: string, blockIds: string[]) => Promise<void>;
  /** Réglages (`cv.settings`) actuels du CV. */
  getCvSettings: (cvId: string) => Record<string, unknown>;
  /** Fusionne `patch` dans `cv.settings`. */
  updateCvSettings: (cvId: string, patch: Record<string, unknown>) => Promise<void>;
}

/** Adaptateur du store Zustand réel (état relu à chaque appel, comme avant l'injection). */
function realStorePort(): CvBlockPort {
  const s = useCvStore.getState();
  return {
    currentCvBlocks: s.currentCvBlocks,
    fetchCvBlocks: s.fetchCvBlocks,
    updateCvBlock: s.updateCvBlock,
    createCvBlock: s.createCvBlock,
    deleteCvBlock: s.deleteCvBlock,
    reorderCvBlocks: s.reorderCvBlocks,
    getCvSettings: cvId => {
      const cv = s.cvs.find(c => c.id === cvId) ?? (s.currentCv?.id === cvId ? s.currentCv : undefined);
      return cv?.settings ?? {};
    },
    updateCvSettings: (cvId, patch) => {
      const cv = s.cvs.find(c => c.id === cvId) ?? (s.currentCv?.id === cvId ? s.currentCv : undefined);
      return s.updateCv(cvId, { settings: { ...(cv?.settings ?? {}), ...patch } });
    },
  };
}

export interface ApplyAiCvOptions {
  /** Fournisseur du store ; défaut : le store Zustand réel. */
  store?: () => CvBlockPort;
  /** Entrées du profil maître ; défaut : le store du profil. */
  entries?: MasterEntry[];
  /** Profil maître (mentions d'en-tête) ; défaut : le store du profil. */
  profile?: Pick<Profile, 'drivingLicense' | 'headerExtras'> | null;
  /**
   * Ciblage effectif de la génération. Fourni : un instantané est enregistré dans `cv.settings.target`
   * (jamais le profil) ; la proposition de l'IA (`analyse.cible`) n'est pas appliquée, seulement rapportée.
   */
  target?: ResolvedTarget;
  /** Fiches personnalisées du profil (pour la fiche d'un type proposé par l'IA). */
  sheetOverrides?: SheetOverrides;
}

export interface ApplyReport {
  /** Langue du CV retenue (code ISO 639-1). */
  cvLanguage: string;
  /** `applied` : sous-en-têtes créés ou mis à jour ; `skipped` : demandé mais écarté (voir `warnings`) ; `none` : non demandé. */
  skillGrouping: 'applied' | 'skipped' | 'none';
  /** Lignes de compétences propres au CV : `applied` ; `skipped` : fournies mais pas appliquées (voir `warnings`) ; `none` : non demandées. */
  skillLines: 'applied' | 'skipped' | 'none';
  /** Section Langues affichée ? `null` quand le profil n'a aucune langue. */
  languagesShown: boolean | null;
  /** Nombre de fusions d'expériences appliquées (`mergedEntries`). */
  merges: number;
  warnings: string[];
  /**
   * Proposition de ciblage de l'IA (absente sans `target`). Jamais appliquée à ce CV : l'écran la
   * montre (« Ciblage proposé ») et `target` est le ciblage à utiliser pour « Appliquer et régénérer ».
   */
  target?: { proposed: TargetAxis[]; contradictions: TargetContradiction[]; raison?: string; target: ResolvedTarget };
}

/** Seuils du regroupement des compétences (garde-fou contre les catégories creuses). */
export const SKILL_GROUPING_LIMITS = { minVisibleSkills: 8, minGroups: 2, maxGroups: 4, minPerGroup: 2 } as const;

/**
 * Applies an AI-generated CV response to an existing CV's blocks, non
 * destructively. The master profile is never touched: selection, reformulation,
 * re-ordering, skill grouping, language relevance and section labels all live on
 * `cv_blocks` (override_data, is_visible, section_name, sort_order) and on
 * `cv.settings.cvLanguage`.
 *
 * Steps:
 * 1. Entry-level changes: visibility + display overrides (all entry types),
 *    plus fr/en translation of language names and levels when the AI left them.
 * 2. Languages section relevance (`decideLanguageSection`).
 * 3. Skill grouping: the "Compétences" header is NEVER renamed or removed;
 *    categories become sub-headers (`level: 'sub'`) under it, re-using the ones
 *    of a previous application (idempotent). Ignored unless the thresholds in
 *    `SKILL_GROUPING_LIMITS` are met.
 * 4. Re-ordering: entries by relevance, sections by relevance, ad language first.
 * 5. Section labels (`sectionLabels` + standard English labels) and CV language.
 *
 * Empty sections are not touched here: rendering hides any header without a
 * visible block after it (`cv-sections.ts`), which is reversible and also covers
 * manual edits.
 *
 * Assumes the CV already exists with its blocks (e.g. freshly created/duplicated).
 */
export async function applyAiCvToBlocks(
  cvId: string,
  data: AiCvResponse,
  opts: ApplyAiCvOptions = {},
): Promise<ApplyReport> {
  const store = opts.store ?? realStorePort;
  const entries = opts.entries ?? useProfileStore.getState().entries;
  const entryById = new Map(entries.map(e => [e.id, e] as const));
  const warnings: string[] = [];

  const explicitLanguage = normalizeLanguageCode(data.analyse?.langueAnnonce);
  const cvLanguage = explicitLanguage ?? readCvLanguage(store().getCvSettings(cvId));

  // 0. Fusions d'une application précédente : défaites d'abord (surcharges et visibilité d'origine rétablies),
  //    ce qui rend la réapplication idempotente et une application sans fusion propre.
  await store().fetchCvBlocks(cvId);
  await undoMerges(store);

  // 1. Entry overrides + visibility.
  for (const aiEntry of data.entries) {
    const block = store().currentCvBlocks.find(b => b.entryId === aiEntry.id);
    if (!block) continue;
    if (!aiEntry.visible) {
      await store().updateCvBlock(block.id, { isVisible: false });
    } else {
      await store().updateCvBlock(block.id, {
        isVisible: true,
        overrideData: aiEntryToOverrideData(aiEntry, block.overrideData),
      });
    }
  }

  // 1a. Fusions d'expériences : le bloc de l'entrée la plus récente porte la ligne fusionnée, les autres sont masqués.
  const mergeResult = await applyMerges(data, store, entryById, warnings);

  // 1b. Language names and levels follow the CV language when the AI stated it (the legacy
  //     schema has no language) and left them as-is.
  if (explicitLanguage) {
    for (const block of store().currentCvBlocks) {
      const entry = block.entryId ? entryById.get(block.entryId) : undefined;
      if (!entry || entry.entryType !== 'language' || !block.isVisible) continue;
      const patch: Record<string, unknown> = {};
      if (block.overrideData.title === undefined) {
        const title = translateLanguageLabel(entry.title, explicitLanguage);
        if (title) patch.title = title;
      }
      if (block.overrideData.subtitle === undefined && entry.subtitle) {
        const level = translateLanguageLabel(entry.subtitle, explicitLanguage);
        if (level) patch.subtitle = level;
      }
      if (Object.keys(patch).length > 0) {
        await store().updateCvBlock(block.id, { overrideData: { ...block.overrideData, ...patch } });
      }
    }
  }

  // 2. Languages section relevance.
  let languagesShown: boolean | null = null;
  let languageFrontId: string | undefined;
  {
    const languageBlocks = store().currentCvBlocks.filter(b => b.entryId && entryById.get(b.entryId)?.entryType === 'language');
    if (languageBlocks.length > 0) {
      const infos = languageBlocks.map(b => {
        const e = entryById.get(b.entryId as string) as MasterEntry;
        const level = (b.overrideData.subtitle as string | undefined) ?? e.subtitle;
        return { id: e.id, title: e.title, level: level ?? null, visible: b.isVisible };
      });
      const decision = decideLanguageSection(
        infos,
        cvLanguage,
        [...(data.analyse?.indispensables ?? []), ...(data.analyse?.importants ?? [])],
      );
      languagesShown = decision.show;
      languageFrontId = decision.frontId;
      for (const b of languageBlocks) {
        if (!decision.show && b.isVisible) {
          await store().updateCvBlock(b.id, { isVisible: false });
        } else if (decision.show && !b.isVisible && decision.forceVisibleIds.includes(b.entryId as string)) {
          await store().updateCvBlock(b.id, { isVisible: true });
        }
      }
    }
  }

  // 3. Skill grouping — sub-headers under the untouched skills header.
  const groupPlans: SkillGroupPlan[] = [];
  let skillsHeaderId: string | undefined;
  let skillGrouping: ApplyReport['skillGrouping'] = 'none';
  // Une entrée catégorie (compétence à puces, lib/skill-lines.ts) porte déjà son libellé :
  // pas de sous-en-tête pour elle (sinon le libellé apparaîtrait deux fois).
  const requestedGroups = (data.skillGroups ?? [])
    .map(g => ({ ...g, entryIds: g.entryIds.filter(id => { const e = entryById.get(id); return !e || !isSkillCategory(e); }) }))
    .filter(g => g.entryIds.length > 0);
  if (requestedGroups.length > 0) {
    const plan = await applySkillGroups(cvId, requestedGroups, store, warnings);
    if (plan) {
      groupPlans.push(...plan.groups);
      skillsHeaderId = plan.skillsHeaderId;
      skillGrouping = 'applied';
    } else {
      skillGrouping = 'skipped';
    }
  }

  // 3b. Lignes de compétences reformulées (blocs `custom_text` propres au CV, jamais le profil maître).
  const skillLinePlan = await applySkillLines(cvId, data, store, entryById, warnings);

  // 4. Re-order (entries + sections + skill grouping + ad language first) in a single pass.
  // `entryOrder` peut citer n'importe quel identifiant d'un groupe fusionné : il s'applique au bloc porteur.
  const orderedIds = remapEntryOrder(data.entryOrder, mergeResult.merges);
  const entryOrder = languageFrontId
    ? [languageFrontId, ...(orderedIds ?? []).filter(id => id !== languageFrontId)]
    : orderedIds;
  const needsReorder =
    (entryOrder?.length ?? 0) > 0 || (data.sectionOrder?.length ?? 0) > 0 || groupPlans.length > 0 || skillLinePlan.lineIds.length > 0;
  if (needsReorder) {
    const order = planCvBlockOrder(store().currentCvBlocks, {
      entryOrder,
      sectionOrder: data.sectionOrder,
      sectionLabels: data.sectionLabels,
      skillsHeaderId,
      skillGroups: groupPlans.length > 0 ? groupPlans : undefined,
    });
    // Les lignes de compétences viennent juste sous l'en-tête « Compétences », avant sous-en-têtes et entrées.
    const placed = skillLinePlan.headerId && skillLinePlan.lineIds.length > 0
      ? placeAfter(order, skillLinePlan.headerId, skillLinePlan.lineIds)
      : order;
    await store().reorderCvBlocks(cvId, placed);
  }

  // 4b. En-tête : permis et mentions du profil affichés pour CE CV (cv.settings, profil intact).
  if (data.header) {
    const patch = headerSettingsPatch(data.header, opts.profile ?? useProfileStore.getState().profile);
    if (Object.keys(patch).length > 0) await store().updateCvSettings(cvId, patch);
  }

  // 4c. Ciblage : instantané du ciblage utilisé (les fiches peuvent changer sans toucher à ce CV) et proposition de l'IA, non appliquée.
  let targetReport: ApplyReport['target'];
  if (opts.target) {
    await store().updateCvSettings(cvId, { target: buildTargetSnapshot(opts.target) });
    const outcome = reconcileAiTarget(opts.target, data.analyse?.cible, opts.sheetOverrides);
    targetReport = {
      proposed: outcome.filled,
      contradictions: outcome.contradictions,
      ...(outcome.raison ? { raison: outcome.raison } : {}),
      target: outcome.target,
    };
  }

  // 5. Section labels (after the reorder, which matches on both names) and CV language.
  await applySectionLabels(store, data.sectionLabels, cvLanguage);
  if (explicitLanguage && store().getCvSettings(cvId).cvLanguage !== explicitLanguage) {
    await store().updateCvSettings(cvId, { cvLanguage: explicitLanguage });
  }

  return { cvLanguage, skillGrouping, skillLines: skillLinePlan.status, languagesShown, merges: mergeResult.merges.length, warnings, ...(targetReport ? { target: targetReport } : {}) };
}

/**
 * Creates / re-uses the category sub-headers of the skills section and returns
 * the plan to feed `planCvBlockOrder`, or `null` (with a warning) when the
 * request does not meet `SKILL_GROUPING_LIMITS`.
 */
async function applySkillGroups(
  cvId: string,
  requested: { category: string; entryIds: string[] }[],
  store: () => CvBlockPort,
  warnings: string[],
): Promise<{ skillsHeaderId: string; groups: SkillGroupPlan[] } | null> {
  const limits = SKILL_GROUPING_LIMITS;
  const sorted = [...store().currentCvBlocks].sort((a, b) => a.sortOrder - b.sortOrder);

  // The skills section = the section header preceding the first referenced skill block.
  const referenced = new Set(requested.flatMap(g => g.entryIds));
  let skillsHeader: CVBlock | null = null;
  let current: CVBlock | null = null;
  for (const b of sorted) {
    if (isSectionHeader(b)) current = b;
    else if (b.blockType === 'entry_ref' && b.entryId && referenced.has(b.entryId)) { skillsHeader = current; break; }
  }
  if (!skillsHeader) {
    warnings.push('Regroupement des compétences ignoré : section « Compétences » introuvable.');
    return null;
  }

  // Blocks of that section (until the next section header), sub-headers included.
  const start = sorted.findIndex(b => b.id === skillsHeader!.id);
  const span: CVBlock[] = [];
  for (let i = start + 1; i < sorted.length && !isSectionHeader(sorted[i]); i++) span.push(sorted[i]);
  const visibleSkills = span.filter(b => b.blockType === 'entry_ref' && b.entryId && b.isVisible);
  const visibleIds = new Set(visibleSkills.map(b => b.entryId as string));

  // Keep visible skills of the section only; a skill listed twice stays in its first group.
  const seen = new Set<string>();
  const groups = requested.map(g => ({
    category: g.category,
    entryIds: g.entryIds.filter(id => {
      if (!visibleIds.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  }));

  const problems: string[] = [];
  if (visibleSkills.length < limits.minVisibleSkills) {
    problems.push(`moins de ${limits.minVisibleSkills} compétences visibles (${visibleSkills.length})`);
  }
  if (groups.length < limits.minGroups || groups.length > limits.maxGroups) {
    problems.push(`${groups.length} groupes (${limits.minGroups} à ${limits.maxGroups} attendus)`);
  }
  if (groups.some(g => g.entryIds.length < limits.minPerGroup)) {
    problems.push(`un groupe a moins de ${limits.minPerGroup} compétences`);
  }
  if (problems.length > 0) {
    warnings.push(`Regroupement des compétences ignoré : ${problems.join(', ')}.`);
    return null;
  }

  const inheritedFormat = typeof skillsHeader.overrideData?.displayFormat === 'string'
    ? { displayFormat: skillsHeader.overrideData.displayFormat }
    : {};
  const subOverride = (existing?: Record<string, unknown>): Record<string, unknown> => ({
    ...(existing ?? {}), level: 'sub', aiManaged: true, ...inheritedFormat,
  });

  // Re-use the sub-headers of a previous application (same name), create the others.
  const existingSubs = span.filter(isSubHeader);
  const reused = new Set<string>();
  const assigned: (string | null)[] = [];
  for (const g of groups) {
    const match = existingSubs.find(s => !reused.has(s.id) && normalizeLabel(s.sectionName ?? '') === normalizeLabel(g.category));
    if (match) {
      reused.add(match.id);
      assigned.push(match.id);
      await store().updateCvBlock(match.id, { isVisible: true, overrideData: subOverride(match.overrideData) });
    } else {
      assigned.push(null);
    }
  }
  const beforeIds = new Set(store().currentCvBlocks.map(b => b.id));
  for (let i = 0; i < groups.length; i++) {
    if (assigned[i] !== null) continue;
    await store().createCvBlock({
      cvId,
      entryId: null,
      blockType: 'section_header',
      sectionName: groups[i].category,
      customContent: null,
      // Temporary tail position; the reorder fixes the real position.
      sortOrder: 100_000 + i,
      isVisible: true,
      overrideData: subOverride(),
    });
  }
  const created = store().currentCvBlocks.filter(b => !beforeIds.has(b.id));
  const plans: SkillGroupPlan[] = [];
  groups.forEach((g, i) => {
    const id = assigned[i] ?? created.find(b => b.sortOrder === 100_000 + i)?.id ?? null;
    if (id) plans.push({ headerBlockId: id, entryIds: g.entryIds });
  });

  // Drop the sub-headers created by a previous application that no group uses any more.
  for (const s of existingSubs) {
    if (!reused.has(s.id) && s.overrideData?.aiManaged === true) await store().deleteCvBlock(s.id);
  }

  return { skillsHeaderId: skillsHeader.id, groups: plans };
}

/** Renames section headers to the target-language labels, remembering the internal key. */
async function applySectionLabels(
  store: () => CvBlockPort,
  labels: Record<string, string> | undefined,
  cvLanguage: string,
): Promise<void> {
  const byKey = new Map(Object.entries(labels ?? {}).map(([k, v]) => [normalizeLabel(k), v] as const));
  for (const block of store().currentCvBlocks) {
    if (!isSectionHeader(block) || !block.sectionName) continue;
    const key = typeof block.overrideData?.sectionKey === 'string' ? block.overrideData.sectionKey : block.sectionName;
    const target =
      byKey.get(normalizeLabel(key)) ??
      byKey.get(normalizeLabel(block.sectionName)) ??
      (cvLanguage === 'en' ? defaultSectionLabel(key, 'en') : undefined);
    if (!target || target === block.sectionName) continue;
    await store().updateCvBlock(block.id, {
      sectionName: target,
      overrideData: { ...(block.overrideData ?? {}), sectionKey: key },
    });
  }
}

/** Retire `ids` de `order` et les replace, dans l'ordre donné, juste après `afterId`. */
export function placeAfter(order: readonly string[], afterId: string, ids: readonly string[]): string[] {
  const moved = new Set(ids);
  const rest = order.filter(id => !moved.has(id));
  const at = rest.indexOf(afterId);
  if (at < 0) return [...order];
  return [...rest.slice(0, at + 1), ...ids, ...rest.slice(at + 1)];
}

const isSkillLine = (b: CVBlock): boolean => b.blockType === 'custom_text' && b.overrideData?.aiSkillLine === true;

/**
 * Lignes de compétences reformulées (`cvSkillLines`) : blocs `custom_text` sous l'en-tête
 * « Compétences », marqués `overrideData.aiSkillLine` pour être retrouvés (idempotent : les blocs
 * existants sont mis à jour, les manquants créés, les en trop supprimés ; sans lignes, une application
 * précédente est défaite). À partir de `MIN_SKILL_LINES` lignes, les catégories de compétences du profil
 * ne restent visibles que si l'IA les liste en `visible: true` ; elles sont marquées `hiddenBySkillLines`
 * pour être rétablies quand les lignes disparaissent. En dessous du minimum, rien n'est masqué.
 */
async function applySkillLines(
  cvId: string,
  data: AiCvResponse,
  store: () => CvBlockPort,
  entryById: Map<string, MasterEntry>,
  warnings: string[],
): Promise<{ status: ApplyReport['skillLines']; headerId?: string; lineIds: string[] }> {
  const requested = data.cvSkillLines ?? [];
  const active = requested.length >= MIN_SKILL_LINES;
  const existing = store().currentCvBlocks.filter(isSkillLine).sort((a, b) => a.sortOrder - b.sortOrder);
  // Une catégorie que l'IA masque explicitement dans cette application le reste.
  const explicitHidden = new Set(data.entries.filter(e => !e.visible).map(e => e.id));

  // Rien de demandé, ou trop peu : on défait une application précédente et on garde les catégories.
  if (!active) {
    for (const b of existing) await store().deleteCvBlock(b.id);
    for (const b of store().currentCvBlocks) {
      if (b.overrideData?.hiddenBySkillLines === true) {
        const { hiddenBySkillLines: _flag, ...rest } = b.overrideData;
        await store().updateCvBlock(b.id, { isVisible: !(b.entryId && explicitHidden.has(b.entryId)), overrideData: rest });
      }
    }
    if (requested.length > 0) warnings.push(`Lignes de compétences ignorées : ${requested.length} ligne(s) valide(s), minimum ${MIN_SKILL_LINES}. Les catégories du profil sont conservées.`);
    return { status: requested.length > 0 ? 'skipped' : 'none', lineIds: [] };
  }

  // Section « Compétences » : l'en-tête qui précède le premier bloc de compétence.
  const sorted = [...store().currentCvBlocks].sort((a, b) => a.sortOrder - b.sortOrder);
  let header: CVBlock | null = null;
  let current: CVBlock | null = null;
  for (const b of sorted) {
    if (isSectionHeader(b)) current = b;
    else if (b.blockType === 'entry_ref' && b.entryId && entryById.get(b.entryId)?.entryType === 'skill') { header = current; break; }
  }
  if (!header) {
    warnings.push('Lignes de compétences ignorées : section « Compétences » introuvable.');
    return { status: 'skipped', lineIds: [] };
  }

  // Lignes : mise à jour des blocs existants, création des manquants, suppression des surplus.
  const ids: string[] = [];
  const spare = [...existing];
  for (let i = 0; i < requested.length; i++) {
    const line = requested[i];
    const overrideData = { aiSkillLine: true, sources: line.sources };
    const reuse = spare.shift();
    if (reuse) {
      await store().updateCvBlock(reuse.id, { customContent: line.text, isVisible: true, overrideData });
      ids.push(reuse.id);
    } else {
      const before = new Set(store().currentCvBlocks.map(b => b.id));
      await store().createCvBlock({
        cvId, entryId: null, blockType: 'custom_text', sectionName: null, customContent: line.text,
        sortOrder: 200_000 + i, isVisible: true, overrideData,
      });
      const created = store().currentCvBlocks.find(b => !before.has(b.id));
      if (created) ids.push(created.id);
    }
  }
  for (const extra of spare) await store().deleteCvBlock(extra.id);

  // Catégories du profil : visibles seulement si l'IA les liste en `visible: true`.
  const listedVisible = new Set(data.entries.filter(e => e.visible).map(e => e.id));
  for (const b of store().currentCvBlocks) {
    const entry = b.entryId ? entryById.get(b.entryId) : undefined;
    if (!entry || b.blockType !== 'entry_ref' || !isSkillCategory(entry)) continue;
    const keep = listedVisible.has(entry.id);
    if (!keep && b.isVisible) {
      await store().updateCvBlock(b.id, { isVisible: false, overrideData: { ...(b.overrideData ?? {}), hiddenBySkillLines: true } });
    } else if (keep && b.overrideData?.hiddenBySkillLines === true) {
      const { hiddenBySkillLines: _flag, ...rest } = b.overrideData;
      await store().updateCvBlock(b.id, { isVisible: true, overrideData: rest });
    }
  }
  return { status: 'applied', headerId: header.id, lineIds: ids };
}

// ── Fusion d'expériences ────────────────────────────────────────────────────

/** Clés de `override_data` écrites par une fusion sur le bloc porteur (restaurées à la défusion). */
const MERGE_KEYS = ['title', 'subtitle', 'description', 'startDate', 'endDate', 'isCurrent', 'datesOverride'] as const;

interface MergeBackup {
  values: Record<string, unknown>;
  absent: string[];
}

/** Rétablit un bloc porteur : surcharges d'avant la fusion, sans marqueur de fusion. */
function restoredCarrier(block: CVBlock): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(block.overrideData ?? {}) };
  const backup = next.mergeBackup as MergeBackup | undefined;
  delete next.mergedFrom;
  delete next.mergeBackup;
  for (const key of MERGE_KEYS) {
    if (backup && key in backup.values) next[key] = backup.values[key];
    else delete next[key];
  }
  return next;
}

const isMergeCarrier = (b: CVBlock): boolean => b.blockType === 'entry_ref' && Array.isArray(b.overrideData?.mergedFrom);
const isMergeMember = (b: CVBlock): boolean => b.blockType === 'entry_ref' && typeof b.overrideData?.mergedInto === 'string';

async function restoreMember(store: () => CvBlockPort, block: CVBlock): Promise<void> {
  const next: Record<string, unknown> = { ...(block.overrideData ?? {}) };
  const wasVisible = next.mergedWasVisible !== false;
  delete next.mergedInto;
  delete next.mergedWasVisible;
  await store().updateCvBlock(block.id, { isVisible: wasVisible, overrideData: next });
}

/** Défait toutes les fusions du CV : porteurs rétablis, membres de nouveau visibles. */
async function undoMerges(store: () => CvBlockPort): Promise<void> {
  for (const b of store().currentCvBlocks.filter(isMergeCarrier)) {
    await store().updateCvBlock(b.id, { overrideData: restoredCarrier(b) });
  }
  for (const b of store().currentCvBlocks.filter(isMergeMember)) await restoreMember(store, b);
}

/** Défait la fusion portée par un bloc (bouton « Défaire » du CV builder) : visibilité et surcharges rétablies. */
export async function unmergeCarrierBlock(cvId: string, carrierBlockId: string, opts: { store?: () => CvBlockPort } = {}): Promise<void> {
  const store = opts.store ?? realStorePort;
  await store().fetchCvBlocks(cvId);
  const carrier = store().currentCvBlocks.find(b => b.id === carrierBlockId);
  if (!carrier || !isMergeCarrier(carrier)) return;
  const carrierEntryId = carrier.entryId;
  await store().updateCvBlock(carrier.id, { overrideData: restoredCarrier(carrier) });
  for (const b of store().currentCvBlocks.filter(isMergeMember)) {
    if (b.overrideData.mergedInto === carrierEntryId) await restoreMember(store, b);
  }
}

async function applyMerges(
  data: AiCvResponse,
  store: () => CvBlockPort,
  entryById: Map<string, MasterEntry>,
  warnings: string[],
): Promise<{ merges: ResolvedMerge[] }> {
  const merges: ResolvedMerge[] = [];
  const taken = new Set<string>();
  for (const group of data.mergedEntries ?? []) {
    const res = resolveMergedGroup(group, entryById, taken);
    if (!res.ok) {
      warnings.push(`Fusion ignorée (${res.reason}) : ${group.ids.join(', ')}.`);
      continue;
    }
    const merge = res.merge;
    const carrier = store().currentCvBlocks.find(b => b.blockType === 'entry_ref' && b.entryId === merge.carrierId);
    if (!carrier) {
      warnings.push(`Fusion ignorée : bloc introuvable pour « ${entryById.get(merge.carrierId)?.title ?? merge.carrierId} ».`);
      continue;
    }
    merge.ids.forEach(id => taken.add(id));
    merges.push(merge);

    // Surcharges d'avant la fusion, gardées pour pouvoir la défaire.
    const base = carrier.overrideData ?? {};
    const backup: MergeBackup = { values: {}, absent: [] };
    for (const key of MERGE_KEYS) {
      if (key in base) backup.values[key] = base[key]; else backup.absent.push(key);
    }
    const next: Record<string, unknown> = {
      ...base,
      subtitle: merge.subtitle,
      description: merge.description,
      startDate: merge.dates.startDate,
      endDate: merge.dates.endDate,
      isCurrent: merge.dates.isCurrent,
      mergedFrom: merge.ids,
      mergeBackup: backup,
    };
    if (merge.titleOverride !== undefined) next.title = merge.titleOverride;
    // Dates calculées, au format habituel du CV : jamais de datesOverride sur une ligne fusionnée.
    delete next.datesOverride;

    // L'IA peut masquer toutes les entrées du groupe : la ligne fusionnée l'est aussi.
    const visible = merge.ids.some(id => data.entries.find(e => e.id === id)?.visible !== false);
    await store().updateCvBlock(carrier.id, { isVisible: visible, overrideData: next });

    for (const id of merge.ids) {
      if (id === merge.carrierId) continue;
      const member = store().currentCvBlocks.find(b => b.blockType === 'entry_ref' && b.entryId === id);
      if (!member) continue;
      await store().updateCvBlock(member.id, {
        isVisible: false,
        overrideData: { ...(member.overrideData ?? {}), mergedInto: merge.carrierId, mergedWasVisible: member.isVisible },
      });
    }
  }
  return { merges };
}
