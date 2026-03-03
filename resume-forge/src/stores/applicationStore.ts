import { create } from 'zustand';
import { Application, ApplicationEvent } from '@/types/application';
import { getDb } from '@/lib/db';

interface ApplicationState {
  applications: Application[];
  events: ApplicationEvent[];
  isLoading: boolean;
  error: string | null;
  fetchApplications: () => Promise<void>;
  createApplication: (app: Omit<Application, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateApplication: (id: string, updates: Partial<Application>) => Promise<void>;
  deleteApplication: (id: string) => Promise<void>;
}

export const useApplicationStore = create<ApplicationState>((set) => ({
  applications: [],
  events: [],
  isLoading: false,
  error: null,

  fetchApplications: async () => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDb();
      const applications = await db.select<Application[]>('SELECT * FROM applications ORDER BY updated_at DESC');
      set({ applications });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch applications' });
    } finally {
      set({ isLoading: false });
    }
  },

  createApplication: async (_app) => {
    // Insert db...
  },

  updateApplication: async (_id, _updates) => {
    // Update db...
  },

  deleteApplication: async (_id) => {
    // Delete db...
  },
}));