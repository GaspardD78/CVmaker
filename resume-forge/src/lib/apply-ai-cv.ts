import type { AiCvResponse, SkillGroupPlan } from './ai-cv-response';
import { aiEntryToOverrideData, planCvBlockOrder } from './ai-cv-response';
import { isSectionHeader, isSubHeader, normalizeLabel } from './cv-sections';
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
import type { MasterEntry } from '@/types/profile';

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
}

export interface ApplyReport {
  /** Langue du CV retenue (code ISO 639-1). */
  cvLanguage: string;
  /** `applied` : sous-en-têtes créés ou mis à jour ; `skipped` : demandé mais écarté (voir `warnings`) ; `none` : non demandé. */
  skillGrouping: 'applied' | 'skipped' | 'none';
  /** Section Langues affichée ? `null` quand le profil n'a aucune langue. */
  languagesShown: boolean | null;
  warnings: string[];
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

  // 1. Entry overrides + visibility.
  await store().fetchCvBlocks(cvId);
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
  const requestedGroups = (data.skillGroups ?? []).filter(g => g.entryIds.length > 0);
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

  // 4. Re-order (entries + sections + skill grouping + ad language first) in a single pass.
  const entryOrder = languageFrontId
    ? [languageFrontId, ...(data.entryOrder ?? []).filter(id => id !== languageFrontId)]
    : data.entryOrder;
  const needsReorder =
    (entryOrder?.length ?? 0) > 0 || (data.sectionOrder?.length ?? 0) > 0 || groupPlans.length > 0;
  if (needsReorder) {
    const order = planCvBlockOrder(store().currentCvBlocks, {
      entryOrder,
      sectionOrder: data.sectionOrder,
      sectionLabels: data.sectionLabels,
      skillsHeaderId,
      skillGroups: groupPlans.length > 0 ? groupPlans : undefined,
    });
    await store().reorderCvBlocks(cvId, order);
  }

  // 5. Section labels (after the reorder, which matches on both names) and CV language.
  await applySectionLabels(store, data.sectionLabels, cvLanguage);
  if (explicitLanguage && store().getCvSettings(cvId).cvLanguage !== explicitLanguage) {
    await store().updateCvSettings(cvId, { cvLanguage: explicitLanguage });
  }

  return { cvLanguage, skillGrouping, languagesShown, warnings };
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
