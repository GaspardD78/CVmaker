import { create } from 'zustand';
import { CVDocument, CVBlock } from '@/types/cv';
import { getDb } from '@/lib/db';

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

export const useCvStore = create<CVState>((set) => ({
  cvs: [],
  currentCvBlocks: [],
  isLoading: false,
  error: null,

  fetchCvs: async () => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDb();
      const cvs = await db.select<CVDocument[]>('SELECT * FROM cv_documents ORDER BY updated_at DESC');
      set({ cvs });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch CVs' });
    } finally {
      set({ isLoading: false });
    }
  },

  createCv: async (_cv) => {
    // Insert db...
  },

  deleteCv: async (_id) => {
    // Delete db...
  },

  updateCv: async (_id, _updates) => {
    // Update db...
  },
}));