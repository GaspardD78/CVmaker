import { create } from 'zustand';
import { CVDocument, CVBlock } from '@/types/cv';
import { getDb } from '@/lib/db';
import { keysToCamelCase, keysToSnakeCase } from '@/lib/mapping';

interface CVState {
  cvs: CVDocument[];
  currentCv: CVDocument | null;
  currentCvBlocks: CVBlock[];
  isLoading: boolean;
  error: string | null;
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
  isLoading: false,
  error: null,

  fetchCvs: async () => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDb();
      const rawCvs = await db.select<any[]>('SELECT * FROM cv_documents ORDER BY updated_at DESC');
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
      const rawCvs = await db.select<any[]>('SELECT * FROM cv_documents WHERE id = $1', [id]);
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
      const rawBlocks = await db.select<any[]>('SELECT * FROM cv_blocks WHERE cv_id = $1 ORDER BY sort_order ASC', [cvId]);
      const blocks = rawBlocks.map(b => keysToCamelCase<CVBlock>(b));
      set({ currentCvBlocks: blocks });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch CV blocks' });
    } finally {
      set({ isLoading: false });
    }
  },

  createCv: async (cv) => {
    try {
      const db = await getDb();
      const snakeCv = keysToSnakeCase<Record<string, any>>(cv);
      const keys = Object.keys(snakeCv);
      const values = Object.values(snakeCv);

      const columns = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

      await db.execute(
        `INSERT INTO cv_documents (${columns}) VALUES (${placeholders})`,
        values
      );
      await get().fetchCvs();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create CV' });
    }
  },

  duplicateCv: async (id) => {
    try {
      const db = await getDb();
      // 1. Fetch original CV
      const rawCvs = await db.select<any[]>('SELECT * FROM cv_documents WHERE id = $1', [id]);
      if (rawCvs.length === 0) return;
      const originalCv = rawCvs[0];

      // 2. Create new CV based on original
      const newName = `${originalCv.name} (copie)`;
      const cvToInsert = { ...originalCv, id: undefined, name: newName, created_at: undefined, updated_at: undefined };
      const keys = Object.keys(cvToInsert).filter(k => cvToInsert[k] !== undefined);
      const values = keys.map(k => cvToInsert[k]);

      const columns = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

      await db.execute(
        `INSERT INTO cv_documents (${columns}) VALUES (${placeholders})`,
        values
      );

      // Need to get the ID of the newly inserted CV. SQLite `lastInsertRowId`
      const newIdRow = await db.select<any[]>('SELECT id FROM cv_documents ORDER BY created_at DESC LIMIT 1');
      if(newIdRow.length > 0) {
        const newCvId = newIdRow[0].id;
        // 3. Duplicate blocks
        const rawBlocks = await db.select<any[]>('SELECT * FROM cv_blocks WHERE cv_id = $1', [id]);
        for (const block of rawBlocks) {
          const blockToInsert = { ...block, id: undefined, cv_id: newCvId, created_at: undefined };
          const bKeys = Object.keys(blockToInsert).filter(k => blockToInsert[k] !== undefined);
          const bValues = bKeys.map(k => blockToInsert[k]);

          const bColumns = bKeys.join(', ');
          const bPlaceholders = bKeys.map((_, i) => `$${i + 1}`).join(', ');
          await db.execute(`INSERT INTO cv_blocks (${bColumns}) VALUES (${bPlaceholders})`, bValues);
        }
      }

      await get().fetchCvs();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to duplicate CV' });
    }
  },

  deleteCv: async (id) => {
    try {
      const db = await getDb();
      await db.execute('DELETE FROM cv_documents WHERE id = $1', [id]);
      set(state => ({
        cvs: state.cvs.filter(c => c.id !== id)
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete CV' });
    }
  },

  updateCv: async (id, updates) => {
    try {
      const db = await getDb();
      const snakeUpdates = keysToSnakeCase<Record<string, any>>(updates);
      const keys = Object.keys(snakeUpdates);
      const values = Object.values(snakeUpdates);

      if (keys.length > 0) {
        const setString = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
        await db.execute(
          `UPDATE cv_documents SET ${setString}, updated_at = datetime('now') WHERE id = $${keys.length + 1}`,
          [...values, id]
        );
      }
      await get().fetchCvs();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update CV' });
    }
  },

  createCvBlock: async (block) => {
    try {
      const db = await getDb();
      const snakeBlock = keysToSnakeCase<Record<string, any>>(block);
      const keys = Object.keys(snakeBlock);
      const values = Object.values(snakeBlock);

      const columns = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

      await db.execute(
        `INSERT INTO cv_blocks (${columns}) VALUES (${placeholders})`,
        values
      );
      await get().fetchCvBlocks(block.cvId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create block' });
    }
  },

  updateCvBlock: async (id, updates) => {
    try {
      const db = await getDb();
      const snakeUpdates = keysToSnakeCase<Record<string, any>>(updates);
      const keys = Object.keys(snakeUpdates);
      const values = Object.values(snakeUpdates);

      if (keys.length > 0) {
        const setString = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
        await db.execute(
          `UPDATE cv_blocks SET ${setString} WHERE id = $${keys.length + 1}`,
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
  },

  deleteCvBlock: async (id) => {
    try {
      const db = await getDb();
      const currentBlocks = get().currentCvBlocks;
      const block = currentBlocks.find(b => b.id === id);
      await db.execute('DELETE FROM cv_blocks WHERE id = $1', [id]);
      if(block) {
          await get().fetchCvBlocks(block.cvId);
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete block' });
    }
  },

  reorderCvBlocks: async (cvId, blockIds) => {
    try {
      const db = await getDb();
      for (let i = 0; i < blockIds.length; i++) {
        await db.execute('UPDATE cv_blocks SET sort_order = $1 WHERE id = $2', [i, blockIds[i]]);
      }
      await get().fetchCvBlocks(cvId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to reorder blocks' });
    }
  },
}));