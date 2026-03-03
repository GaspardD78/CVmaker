import { create } from 'zustand';
import { CVDocument, CVBlock } from '@/types/cv';
import { getDb } from '@/lib/db';
import { keysToCamelCase, keysToSnakeCase } from '@/lib/mapping';

interface CVState {
  cvs: CVDocument[];
  currentCvBlocks: CVBlock[];
  isLoading: boolean;
  error: string | null;
  fetchCvs: () => Promise<void>;
  createCv: (cv: Omit<CVDocument, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  deleteCv: (id: string) => Promise<void>;
  updateCv: (id: string, updates: Partial<CVDocument>) => Promise<void>;
}

export const useCvStore = create<CVState>((set, get) => ({
  cvs: [],
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
}));