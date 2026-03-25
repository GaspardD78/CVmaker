import { create } from 'zustand';
import { CVDocument, CVBlock } from '@/types/cv';
import { getDb } from '@/lib/db';
import { keysToCamelCase, keysToSnakeCase } from '@/lib/mapping';
import { filterAllowedColumns } from '@/lib/validation';
import { EntryType, MasterEntry } from '@/types/profile';

/**
 * Serializes all DB write operations to prevent concurrent SQLite writes.
 * The Tauri SQL plugin uses a connection pool; two simultaneous writes from
 * different JS async tasks can each land on a different pool connection,
 * causing "database is locked" errors.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  // Always run the next task, even if the previous one failed
  const task = writeQueue.then(() => fn(), () => fn());
  // Don't let errors propagate into the queue itself
  writeQueue = task.then(() => {}, () => {});
  return task as Promise<T>;
}

interface CVState {
  cvs: CVDocument[];
  currentCv: CVDocument | null;
  currentCvBlocks: CVBlock[];
  isLoading: boolean;
  error: string | null;
  reset: () => void;
  fetchCvs: () => Promise<void>;
  fetchCvById: (id: string) => Promise<void>;
  fetchCvBlocks: (cvId: string) => Promise<void>;
  createCv: (cv: Omit<CVDocument, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  duplicateCv: (id: string) => Promise<void>;
  deleteCv: (id: string) => Promise<void>;
  updateCv: (id: string, updates: Partial<CVDocument>) => Promise<void>;
  createCvBlock: (block: Omit<CVBlock, 'id' | 'createdAt'>) => Promise<void>;
  updateCvBlock: (id: string, updates: Partial<CVBlock>) => Promise<void>;
  deleteCvBlock: (id: string) => Promise<void>;
  reorderCvBlocks: (cvId: string, blockIds: string[]) => Promise<void>;
}

export const useCvStore = create<CVState>((set, get) => ({
  cvs: [],
  currentCv: null,
  currentCvBlocks: [],
  reset: () => set({ cvs: [], currentCv: null, currentCvBlocks: [], isLoading: false, error: null }),
  isLoading: false,
  error: null,

  fetchCvs: async () => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDb();
      // Scope by current user's profile
      const { useAuthStore } = await import('@/stores/authStore');
      const currentUserId = useAuthStore.getState().currentUserId;
      let rawCvs: Record<string, unknown>[];
      if (currentUserId) {
        rawCvs = await db.select<Record<string, unknown>[]>('SELECT * FROM cv_documents WHERE profile_id = ?1 ORDER BY updated_at DESC', [currentUserId]);
      } else {
        rawCvs = await db.select<Record<string, unknown>[]>('SELECT * FROM cv_documents ORDER BY updated_at DESC');
      }
      const cvs = rawCvs.map(cv => keysToCamelCase<CVDocument>(cv));
      set({ cvs });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch CVs' });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchCvById: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDb();
      const rawCvs = await db.select<Record<string, unknown>[]>('SELECT * FROM cv_documents WHERE id = ?1', [id]);
      if (rawCvs.length > 0) {
        set({ currentCv: keysToCamelCase<CVDocument>(rawCvs[0]) });
      } else {
        set({ currentCv: null });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch CV' });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchCvBlocks: async (cvId) => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDb();
      const rawBlocks = await db.select<Record<string, unknown>[]>('SELECT * FROM cv_blocks WHERE cv_id = ?1 ORDER BY sort_order ASC', [cvId]);
      const blocks = rawBlocks.map(b => keysToCamelCase<CVBlock>(b));
      set({ currentCvBlocks: blocks });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch CV blocks' });
    } finally {
      set({ isLoading: false });
    }
  },

  createCv: (cv) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      const snakeCv = filterAllowedColumns('cv_documents', keysToSnakeCase<Record<string, unknown>>(cv));
      const keys = Object.keys(snakeCv);
      const values = [...Object.values(snakeCv)];

      const columns = keys.join(', ');
      const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ');

      const insertResult = await db.select<{id: string}[]>(
        `INSERT INTO cv_documents (${columns}) VALUES (${placeholders}) RETURNING id`,
        values
      );

      // Auto-import all master profile entries into the new CV
      if (insertResult.length > 0) {
        const newCvId = insertResult[0].id;

        // Lazy import to avoid circular dependency
        const { useProfileStore } = await import('@/stores/profileStore');
        const entries = useProfileStore.getState().entries;

        if (entries.length > 0) {
          const SECTION_LABELS: Record<EntryType, string> = {
            experience: 'Expériences Professionnelles',
            education: 'Formations',
            skill: 'Compétences',
            certification: 'Certifications',
            language: 'Langues',
            project: 'Projets',
            interest: 'Centres d\'intérêt',
            volunteer: 'Bénévolat',
          };

          // Section display order
          const TYPE_ORDER: EntryType[] = ['experience', 'education', 'skill', 'certification', 'language', 'project', 'interest', 'volunteer'];

          // Group entries by type
          const grouped = new Map<EntryType, MasterEntry[]>();
          for (const entry of entries) {
            const list = grouped.get(entry.entryType) || [];
            list.push(entry);
            grouped.set(entry.entryType, list);
          }

          let sortOrder = 0;
          for (const type of TYPE_ORDER) {
            const typeEntries = grouped.get(type);
            if (!typeEntries || typeEntries.length === 0) continue;

            // Insert section header
            await db.execute(
              `INSERT INTO cv_blocks (cv_id, entry_id, block_type, section_name, custom_content, sort_order, is_visible, override_data) VALUES (?1, NULL, 'section_header', ?2, NULL, ?3, 1, '{}')`,
              [newCvId, SECTION_LABELS[type], sortOrder]
            );
            sortOrder++;

            // Insert entry refs
            for (const entry of typeEntries) {
              await db.execute(
                `INSERT INTO cv_blocks (cv_id, entry_id, block_type, section_name, custom_content, sort_order, is_visible, override_data) VALUES (?1, ?2, 'entry_ref', NULL, NULL, ?3, 1, '{}')`,
                [newCvId, entry.id, sortOrder]
              );
              sortOrder++;
            }
          }
        }
      }

      await get().fetchCvs();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create CV';
      set({ error: message });
      throw err;
    }
  }),

  duplicateCv: (id) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      const rawCvs = await db.select<Record<string, unknown>[]>('SELECT * FROM cv_documents WHERE id = ?1', [id]);
      if (rawCvs.length === 0) return;
      const originalCv = rawCvs[0];

      const newName = `${originalCv.name} (copie)`;
      const cvToInsert: Record<string, unknown> = filterAllowedColumns('cv_documents', { ...originalCv, id: undefined, name: newName, created_at: undefined, updated_at: undefined });
      const keys = Object.keys(cvToInsert).filter(k => cvToInsert[k] !== undefined);
      const values = keys.map(k => cvToInsert[k]);

      const columns = keys.join(', ');
      const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ');

      const insertResult = await db.select<{id: string}[]>(
        `INSERT INTO cv_documents (${columns}) VALUES (${placeholders}) RETURNING id`,
        values
      );

      if(insertResult.length > 0) {
        const newCvId = insertResult[0].id;
        await db.execute(
          `INSERT INTO cv_blocks (
            cv_id, entry_id, block_type, section_name, custom_content,
            sort_order, is_visible, override_data
          )
          SELECT
            ?1 as cv_id, entry_id, block_type, section_name, custom_content,
            sort_order, is_visible, override_data
          FROM cv_blocks WHERE cv_id = ?2`,
          [newCvId, id]
        );
      }

      await get().fetchCvs();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to duplicate CV';
      set({ error: message });
      throw err;
    }
  }),

  deleteCv: (id) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      await db.execute('DELETE FROM cv_documents WHERE id = ?1', [id]);
      set(state => ({
        cvs: state.cvs.filter(c => c.id !== id)
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete CV';
      set({ error: message });
      throw err;
    }
  }),

  updateCv: (id, updates) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      const snakeUpdates = filterAllowedColumns('cv_documents', keysToSnakeCase<Record<string, unknown>>(updates));
      const keys = Object.keys(snakeUpdates);
      const values = [...Object.values(snakeUpdates)];

      if (keys.length > 0) {
        const setString = keys.map((key, i) => `${key} = ?${i + 1}`).join(', ');
        await db.execute(
          `UPDATE cv_documents SET ${setString}, updated_at = datetime('now') WHERE id = ?${keys.length + 1}`,
          [...values, id]
        );
      }
      await get().fetchCvs();
      // Merge updates into currentCv directly instead of re-fetching.
      // Re-fetching via fetchCvById caused a race condition: when a design save
      // and a template change were queued concurrently, the design save's
      // fetchCvById would read stale data and revert the optimistic template update.
      const currentCv = get().currentCv;
      if (currentCv && currentCv.id === id) {
        set({ currentCv: { ...currentCv, ...updates } });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update CV' });
    }
  }),

  createCvBlock: (block) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      const snakeBlock = filterAllowedColumns('cv_blocks', keysToSnakeCase<Record<string, unknown>>(block));
      const keys = Object.keys(snakeBlock);
      const values = [...Object.values(snakeBlock)];

      const columns = keys.join(', ');
      const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ');

      await db.execute(
        `INSERT INTO cv_blocks (${columns}) VALUES (${placeholders})`,
        values
      );
      await get().fetchCvBlocks(block.cvId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create block' });
    }
  }),

  updateCvBlock: (id, updates) => enqueueWrite(async () => {
    try {
      // Optimistic update so the UI immediately reflects the new changes (e.g. sectionName)
      set(state => ({
        currentCvBlocks: state.currentCvBlocks.map(block =>
          block.id === id ? { ...block, ...updates } : block
        )
      }));

      const db = await getDb();
      const snakeUpdates = filterAllowedColumns('cv_blocks', keysToSnakeCase<Record<string, unknown>>(updates));
      const keys = Object.keys(snakeUpdates);
      const values = [...Object.values(snakeUpdates)];

      if (keys.length > 0) {
        const setString = keys.map((key, i) => `${key} = ?${i + 1}`).join(', ');
        await db.execute(
          `UPDATE cv_blocks SET ${setString} WHERE id = ?${keys.length + 1}`,
          [...values, id]
        );
      }

      const currentBlocks = get().currentCvBlocks;
      const block = currentBlocks.find(b => b.id === id);
      if(block) {
          await get().fetchCvBlocks(block.cvId);
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update block' });
    }
  }),

  deleteCvBlock: (id) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      const currentBlocks = get().currentCvBlocks;
      const block = currentBlocks.find(b => b.id === id);
      await db.execute('DELETE FROM cv_blocks WHERE id = ?1', [id]);
      if(block) {
          await get().fetchCvBlocks(block.cvId);
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete block' });
    }
  }),

  reorderCvBlocks: (cvId, blockIds) => enqueueWrite(async () => {
    let db;
    try {
      db = await getDb();
      await db.execute('BEGIN TRANSACTION');
      for (let i = 0; i < blockIds.length; i++) {
        await db.execute('UPDATE cv_blocks SET sort_order = ?1 WHERE id = ?2', [i, blockIds[i]]);
      }
      await db.execute('COMMIT');
      // Do NOT re-fetch here: the optimistic update in handleDragEnd already applied
      // the correct order. Re-fetching would race with the write and potentially reset.
    } catch (err) {
      if (db) {
        try { await db.execute('ROLLBACK'); } catch (e) { /* ignore rollback errors */ }
      }
      // On error: re-fetch to restore the actual DB state
      await get().fetchCvBlocks(cvId);
      set({ error: err instanceof Error ? err.message : 'Failed to reorder blocks' });
    }
  }),
}));
