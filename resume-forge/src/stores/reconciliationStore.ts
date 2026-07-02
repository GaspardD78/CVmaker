import { create } from 'zustand';
import type Database from '@tauri-apps/plugin-sql';
import { getDb } from '@/lib/db';
import { keysToCamelCase, keysToSnakeCase } from '@/lib/mapping';
import { filterAllowedColumns } from '@/lib/validation';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import type { EntryVariantHistory } from '@/types/profile';
import type { CVBlock } from '@/types/cv';
import {
  findSyncCandidates,
  hashSnapshotForIgnore,
  RECONCILIATION_IGNORED_HASH_KEY,
  type SyncCandidate,
  type ConsolidatedProposal,
} from '@/lib/experience-matching';

/**
 * Serializes DB writes — same pattern as cvStore/profileStore to avoid
 * "database is locked" errors on the shared SQLite connection pool.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const task = writeQueue.then(() => fn(), () => fn());
  writeQueue = task.then(() => {}, () => {});
  return task as Promise<T>;
}

/** Keys in cv_blocks.override_data that the matching layer treats as experience content overrides. */
const OVERRIDDEN_DISPLAY_KEYS = ['title', 'subtitle', 'description', 'datesOverride'];

async function repointBlockAfterResolution(db: Database, blockId: string, targetEntryId: string): Promise<void> {
  const rows = await db.select<{ override_data: string }[]>(
    'SELECT override_data FROM cv_blocks WHERE id = ?1',
    [blockId],
  );
  let current: Record<string, unknown> = {};
  try {
    current = rows[0]?.override_data ? JSON.parse(rows[0].override_data) : {};
  } catch {
    current = {};
  }
  for (const key of OVERRIDDEN_DISPLAY_KEYS) delete current[key];
  await db.execute(
    'UPDATE cv_blocks SET entry_id = ?1, override_data = ?2 WHERE id = ?3',
    [targetEntryId, JSON.stringify(current), blockId],
  );
}

async function insertVariantHistory(
  db: Database,
  candidate: SyncCandidate,
  masterEntryId: string,
  cvId: string,
  cvName: string,
  matchScore: number | null,
  matchCriteria: Record<string, unknown>,
  resolution: 'merged' | 'new_entry',
): Promise<void> {
  const snakeEntry = filterAllowedColumns('entry_variant_history', keysToSnakeCase<Record<string, unknown>>({
    masterEntryId,
    sourceCvId: cvId,
    sourceCvName: cvName,
    rawTitle: candidate.adapted.title,
    rawSubtitle: candidate.adapted.subtitle,
    rawLocation: candidate.linkedEntry.location,
    rawStartDate: candidate.linkedEntry.startDate,
    rawEndDate: candidate.linkedEntry.endDate,
    rawIsCurrent: candidate.linkedEntry.isCurrent,
    rawDescription: candidate.adapted.description,
    matchScore,
    matchCriteria,
    resolution,
  }));
  const keys = Object.keys(snakeEntry);
  const values = Object.values(snakeEntry);
  const columns = keys.join(', ');
  const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ');
  await db.execute(`INSERT INTO entry_variant_history (${columns}) VALUES (${placeholders})`, values);
}

interface ReconciliationState {
  candidates: SyncCandidate[];
  isLoading: boolean;
  error: string | null;
  variantHistory: Record<string, EntryVariantHistory[]>;
  reset: () => void;
  loadCandidates: (cvId: string) => Promise<void>;
  mergeCandidate: (candidate: SyncCandidate, consolidated: ConsolidatedProposal, cvId: string, cvName: string) => Promise<void>;
  createAsNewEntry: (candidate: SyncCandidate, consolidated: ConsolidatedProposal, cvId: string, cvName: string) => Promise<void>;
  ignoreCandidate: (candidate: SyncCandidate) => Promise<void>;
  fetchVariantHistory: (masterEntryId: string) => Promise<void>;
}

export const useReconciliationStore = create<ReconciliationState>((set) => ({
  candidates: [],
  isLoading: false,
  error: null,
  variantHistory: {},

  reset: () => set({ candidates: [], isLoading: false, error: null }),

  loadCandidates: async (cvId) => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDb();
      const rawBlocks = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM cv_blocks WHERE cv_id = ?1 ORDER BY sort_order ASC',
        [cvId],
      );
      const blocks = rawBlocks.map(b => keysToCamelCase<CVBlock>(b));
      const entries = useProfileStore.getState().entries;

      const all = findSyncCandidates(blocks, entries);

      // Drop candidates whose exact content was already explicitly ignored for this block.
      const blockById = new Map(blocks.map(b => [b.id, b]));
      const filtered = all.filter((c) => {
        const block = blockById.get(c.blockId);
        const ignoredHash = block?.overrideData?.[RECONCILIATION_IGNORED_HASH_KEY];
        return ignoredHash !== hashSnapshotForIgnore(c.adapted);
      });

      set({ candidates: filtered });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load sync candidates' });
    } finally {
      set({ isLoading: false });
    }
  },

  mergeCandidate: (candidate, consolidated, cvId, cvName) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      const targetEntry = candidate.bestMatch?.entry ?? candidate.linkedEntry;

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
        [...values, targetEntry.id],
      );

      await insertVariantHistory(
        db, candidate, targetEntry.id, cvId, cvName,
        candidate.bestMatch?.score.overallScore ?? null,
        candidate.bestMatch?.score.matchedCriteria ?? {},
        'merged',
      );
      await repointBlockAfterResolution(db, candidate.blockId, targetEntry.id);

      await useProfileStore.getState().fetchProfile();
      await useCvStore.getState().fetchCvBlocks(cvId);
      set(state => ({ candidates: state.candidates.filter(c => c.blockId !== candidate.blockId) }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to merge candidate' });
      throw err;
    }
  }),

  createAsNewEntry: (candidate, consolidated, cvId, cvName) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      const profileId = useProfileStore.getState().profile?.id;
      if (!profileId) throw new Error('Aucun profil actif');

      const snakeEntry = filterAllowedColumns('master_entries', keysToSnakeCase<Record<string, unknown>>({
        profileId,
        entryType: 'experience',
        title: consolidated.title,
        subtitle: consolidated.subtitle,
        location: consolidated.location,
        startDate: consolidated.startDate,
        endDate: consolidated.endDate,
        isCurrent: consolidated.isCurrent,
        description: consolidated.description,
        metadata: {},
        sortOrder: useProfileStore.getState().entries.length,
        tags: [],
      }));
      const keys = Object.keys(snakeEntry);
      const values = Object.values(snakeEntry);
      const columns = keys.join(', ');
      const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ');
      const inserted = await db.select<{ id: string }[]>(
        `INSERT INTO master_entries (${columns}) VALUES (${placeholders}) RETURNING id`,
        values,
      );
      const newEntryId = inserted[0].id;

      await insertVariantHistory(
        db, candidate, newEntryId, cvId, cvName,
        candidate.bestMatch?.score.overallScore ?? null,
        candidate.bestMatch?.score.matchedCriteria ?? {},
        'new_entry',
      );
      await repointBlockAfterResolution(db, candidate.blockId, newEntryId);

      await useProfileStore.getState().fetchProfile();
      await useCvStore.getState().fetchCvBlocks(cvId);
      set(state => ({ candidates: state.candidates.filter(c => c.blockId !== candidate.blockId) }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create new entry' });
      throw err;
    }
  }),

  ignoreCandidate: (candidate) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      const rows = await db.select<{ override_data: string }[]>(
        'SELECT override_data FROM cv_blocks WHERE id = ?1',
        [candidate.blockId],
      );
      let current: Record<string, unknown> = {};
      try {
        current = rows[0]?.override_data ? JSON.parse(rows[0].override_data) : {};
      } catch {
        current = {};
      }
      current[RECONCILIATION_IGNORED_HASH_KEY] = hashSnapshotForIgnore(candidate.adapted);
      await db.execute(
        'UPDATE cv_blocks SET override_data = ?1 WHERE id = ?2',
        [JSON.stringify(current), candidate.blockId],
      );
      set(state => ({ candidates: state.candidates.filter(c => c.blockId !== candidate.blockId) }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to ignore candidate' });
      throw err;
    }
  }),

  fetchVariantHistory: async (masterEntryId) => {
    try {
      const db = await getDb();
      const rows = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM entry_variant_history WHERE master_entry_id = ?1 ORDER BY synced_at DESC',
        [masterEntryId],
      );
      const history = rows.map(r => keysToCamelCase<EntryVariantHistory>(r));
      set(state => ({ variantHistory: { ...state.variantHistory, [masterEntryId]: history } }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch variant history' });
    }
  },
}));
