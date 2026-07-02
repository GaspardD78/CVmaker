import { create } from 'zustand';
import type Database from '@tauri-apps/plugin-sql';
import { getDb } from '@/lib/db';
import { keysToSnakeCase } from '@/lib/mapping';
import { filterAllowedColumns } from '@/lib/validation';
import { useProfileStore } from '@/stores/profileStore';
import type { MasterEntry } from '@/types/profile';
import type { ConsolidatedProposal } from '@/lib/experience-matching';
import {
  findDuplicateGroups,
  buildGroupProposal,
  dismissalPairKey,
  pairsForGroupDismissal,
  pairsForEntryRemoval,
  pairScoreWithin,
  type DuplicateGroup,
} from '@/lib/duplicate-scan';

export { buildGroupProposal };
export type { DuplicateGroup };

/**
 * Serializes DB writes — same pattern as cvStore/profileStore/reconciliationStore
 * to avoid "database is locked" errors on the shared SQLite connection pool.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const task = writeQueue.then(() => fn(), () => fn());
  writeQueue = task.then(() => {}, () => {});
  return task as Promise<T>;
}

async function loadDismissedPairKeys(db: Database): Promise<Set<string>> {
  const rows = await db.select<{ entry_id_a: string; entry_id_b: string }[]>(
    'SELECT entry_id_a, entry_id_b FROM duplicate_dismissals',
  );
  return new Set(rows.map(r => dismissalPairKey(r.entry_id_a, r.entry_id_b)));
}

async function persistDismissedPairs(db: Database, pairs: Array<[string, string]>): Promise<void> {
  for (const [a, b] of pairs) {
    await db.execute(
      'INSERT OR IGNORE INTO duplicate_dismissals (entry_id_a, entry_id_b) VALUES (?1, ?2)',
      [a, b],
    );
  }
}

/**
 * Same audit trail as the CV → master reconciliation (`entry_variant_history`,
 * resolution 'merged'): the absorbed duplicate stays visible in the kept
 * entry's variant history instead of silently disappearing. No source CV here —
 * `matchCriteria.origin` marks the row as coming from the duplicate scan.
 */
async function insertAbsorbedVariantHistory(
  db: Database,
  keptEntryId: string,
  absorbed: MasterEntry,
  group: DuplicateGroup,
): Promise<void> {
  const score = pairScoreWithin(group, keptEntryId, absorbed.id);
  const snakeEntry = filterAllowedColumns('entry_variant_history', keysToSnakeCase<Record<string, unknown>>({
    masterEntryId: keptEntryId,
    sourceCvId: null,
    sourceCvName: null,
    rawTitle: absorbed.title,
    rawSubtitle: absorbed.subtitle,
    rawLocation: absorbed.location,
    rawStartDate: absorbed.startDate,
    rawEndDate: absorbed.endDate,
    rawIsCurrent: absorbed.isCurrent,
    rawDescription: absorbed.description,
    matchScore: score?.overallScore ?? null,
    matchCriteria: { ...(score?.matchedCriteria ?? {}), origin: 'duplicate_scan' },
    resolution: 'merged',
  }));
  const keys = Object.keys(snakeEntry);
  const values = Object.values(snakeEntry);
  const columns = keys.join(', ');
  const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ');
  await db.execute(`INSERT INTO entry_variant_history (${columns}) VALUES (${placeholders})`, values);
}

interface DuplicateScanState {
  groups: DuplicateGroup[];
  hasScanned: boolean;
  isScanning: boolean;
  error: string | null;
  dismissedPairKeys: Set<string>;
  reset: () => void;
  /** Manual, on-demand scan of the whole master profile against itself. Read-only. */
  scan: () => Promise<void>;
  /** Merges the group into its oldest entry (updated with the validated proposal); the others are absorbed. */
  mergeGroup: (group: DuplicateGroup, consolidated: ConsolidatedProposal) => Promise<void>;
  /** "Confirmed non-duplicate" for every pair of the group — never re-proposed. */
  dismissGroup: (group: DuplicateGroup) => Promise<void>;
  /** Pulls one mismatched entry out of a group; its pairs with the other members are never re-proposed. */
  removeEntryFromGroup: (group: DuplicateGroup, entryId: string) => Promise<void>;
}

export const useDuplicateScanStore = create<DuplicateScanState>((set, get) => ({
  groups: [],
  hasScanned: false,
  isScanning: false,
  error: null,
  dismissedPairKeys: new Set(),

  reset: () => set({ groups: [], hasScanned: false, isScanning: false, error: null }),

  scan: async () => {
    set({ isScanning: true, error: null });
    try {
      const db = await getDb();
      const dismissed = await loadDismissedPairKeys(db);
      const entries = useProfileStore.getState().entries;
      set({ groups: findDuplicateGroups(entries, dismissed), dismissedPairKeys: dismissed, hasScanned: true });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to scan for duplicates' });
    } finally {
      set({ isScanning: false });
    }
  },

  mergeGroup: (group, consolidated) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      const [kept, ...absorbed] = group.entries;

      const snakeUpdates = filterAllowedColumns('master_entries', keysToSnakeCase<Record<string, unknown>>({
        title: consolidated.title,
        subtitle: consolidated.subtitle,
        location: consolidated.location,
        startDate: consolidated.startDate,
        endDate: consolidated.endDate,
        isCurrent: consolidated.isCurrent,
        description: consolidated.description,
      }));
      const keys = Object.keys(snakeUpdates);
      const values = Object.values(snakeUpdates);
      const setString = keys.map((k, i) => `${k} = ?${i + 1}`).join(', ');
      await db.execute(
        `UPDATE master_entries SET ${setString}, updated_at = datetime('now') WHERE id = ?${keys.length + 1}`,
        [...values, kept.id],
      );

      for (const entry of absorbed) {
        await insertAbsorbedVariantHistory(db, kept.id, entry, group);
        // Everything that pointed at the absorbed duplicate now points at the kept
        // entry: its own variant history (would be cascade-deleted otherwise) and
        // the CV blocks referencing it (entry_id is ON DELETE SET NULL — they would
        // silently lose their content).
        await db.execute(
          'UPDATE entry_variant_history SET master_entry_id = ?1 WHERE master_entry_id = ?2',
          [kept.id, entry.id],
        );
        await db.execute('UPDATE cv_blocks SET entry_id = ?1 WHERE entry_id = ?2', [kept.id, entry.id]);
        await db.execute('DELETE FROM master_entries WHERE id = ?1', [entry.id]);
      }

      await useProfileStore.getState().fetchProfile();
      set(state => ({ groups: state.groups.filter(g => g.id !== group.id) }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to merge duplicate group' });
      throw err;
    }
  }),

  dismissGroup: (group) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      const pairs = pairsForGroupDismissal(group.entries.map(e => e.id));
      await persistDismissedPairs(db, pairs);
      set(state => {
        const dismissed = new Set(state.dismissedPairKeys);
        for (const [a, b] of pairs) dismissed.add(dismissalPairKey(a, b));
        return { dismissedPairKeys: dismissed, groups: state.groups.filter(g => g.id !== group.id) };
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to dismiss duplicate group' });
      throw err;
    }
  }),

  removeEntryFromGroup: (group, entryId) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      const remainingIds = group.entries.filter(e => e.id !== entryId).map(e => e.id);
      const pairs = pairsForEntryRemoval(entryId, remainingIds);
      await persistDismissedPairs(db, pairs);

      const dismissed = new Set(get().dismissedPairKeys);
      for (const [a, b] of pairs) dismissed.add(dismissalPairKey(a, b));
      // Re-derive groups with the updated exclusions: the shrunk group keeps its
      // remaining members (as long as they still match each other), untouched
      // groups keep the same id so their in-progress edits survive.
      const entries = useProfileStore.getState().entries;
      set({ dismissedPairKeys: dismissed, groups: findDuplicateGroups(entries, dismissed) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to remove entry from group' });
      throw err;
    }
  }),
}));
