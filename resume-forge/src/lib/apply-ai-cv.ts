import type { AiCvResponse, SkillGroupPlan } from './ai-cv-response';
import { aiEntryToOverrideData, planCvBlockOrder } from './ai-cv-response';
import { useCvStore } from '@/stores/cvStore';
import type { CVBlock } from '@/types/cv';

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
}

/**
 * Applies an AI-generated CV response to an existing CV's blocks — non
 * destructively. The master profile is never touched: selection, reformulation,
 * re-ordering and skill grouping all live on `cv_blocks` (override_data,
 * is_visible, section_name, sort_order).
 *
 * Steps:
 * 1. Entry-level changes: visibility + display overrides (all entry types).
 * 2. Skill grouping: rename the skills header to the first category and create a
 *    section_header per remaining category (CV-level only).
 * 3. Re-ordering: entries by relevance, sections by relevance, and skill badges
 *    regrouped under their category headers.
 *
 * Assumes the CV already exists with its blocks (e.g. freshly created/duplicated).
 */
export async function applyAiCvToBlocks(
  cvId: string,
  data: AiCvResponse,
  opts: ApplyAiCvOptions = {},
): Promise<void> {
  const store = opts.store ?? realStorePort;

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

  // 2. Skill grouping — create the category sub-headers (CV-level, non destructive).
  const skillGroups = (data.skillGroups ?? []).filter(g => g.entryIds.length > 0);
  const groupPlans: SkillGroupPlan[] = [];
  if (skillGroups.length > 0) {
    const groupedIds = new Set(skillGroups.flatMap(g => g.entryIds));
    const skillHeader = findSkillHeader(store().currentCvBlocks, groupedIds);
    if (skillHeader) {
      // Repurpose the existing skills header as the first category.
      await store().updateCvBlock(skillHeader.id, { sectionName: skillGroups[0].category });
      groupPlans.push({ headerBlockId: skillHeader.id, entryIds: skillGroups[0].entryIds });

      // Create one section_header per remaining category.
      const beforeIds = new Set(store().currentCvBlocks.map(b => b.id));
      for (let i = 1; i < skillGroups.length; i++) {
        await store().createCvBlock({
          cvId,
          entryId: null,
          blockType: 'section_header',
          sectionName: skillGroups[i].category,
          customContent: null,
          // Temporary tail position; the reorder below fixes the real position.
          sortOrder: 100_000 + i,
          isVisible: true,
          overrideData: {},
        });
      }
      // Match the newly created headers back to their category by name.
      const created = store().currentCvBlocks.filter(
        b => !beforeIds.has(b.id) && b.blockType === 'section_header',
      );
      for (let i = 1; i < skillGroups.length; i++) {
        const hb = created.find(
          h => h.sectionName === skillGroups[i].category && !groupPlans.some(p => p.headerBlockId === h.id),
        );
        if (hb) groupPlans.push({ headerBlockId: hb.id, entryIds: skillGroups[i].entryIds });
      }
    }
  }

  // 3. Re-order (entries + sections + skill grouping) in a single pass.
  const needsReorder =
    (data.entryOrder?.length ?? 0) > 0 ||
    (data.sectionOrder?.length ?? 0) > 0 ||
    groupPlans.length > 0;
  if (needsReorder) {
    const order = planCvBlockOrder(store().currentCvBlocks, {
      entryOrder: data.entryOrder,
      sectionOrder: data.sectionOrder,
      skillGroups: groupPlans.length > 0 ? groupPlans : undefined,
    });
    await store().reorderCvBlocks(cvId, order);
  }
}

/**
 * Finds the section_header that introduces the skills section: the most recent
 * header preceding the first skill entry block referenced by a group. Falls back
 * to `null` when no grouped skill block can be located.
 */
function findSkillHeader(blocks: CVBlock[], groupedEntryIds: Set<string>): CVBlock | null {
  const sorted = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  let lastHeader: CVBlock | null = null;
  for (const b of sorted) {
    if (b.blockType === 'section_header') {
      lastHeader = b;
    } else if (b.blockType === 'entry_ref' && b.entryId && groupedEntryIds.has(b.entryId)) {
      return lastHeader;
    }
  }
  return null;
}
