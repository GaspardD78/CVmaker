import { create } from 'zustand';
import { Application, ApplicationEvent } from '@/types/application';
import { getDb } from '@/lib/db';
import { keysToCamelCase, keysToSnakeCase } from '@/lib/mapping';

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

export const useApplicationStore = create<ApplicationState>((set, get) => ({
  applications: [],
  events: [],
  isLoading: false,
  error: null,

  fetchApplications: async () => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDb();
      const rawApps = await db.select<Record<string, unknown>[]>('SELECT * FROM applications ORDER BY updated_at DESC');
      const applications = rawApps.map(app => keysToCamelCase<Application>(app));
      set({ applications });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch applications' });
    } finally {
      set({ isLoading: false });
    }
  },

  createApplication: async (app) => {
    try {
      const db = await getDb();
      const snakeApp = keysToSnakeCase<Record<string, unknown>>(app);
      const keys = Object.keys(snakeApp);
      const values = Object.values(snakeApp);

      const columns = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

      await db.execute(
        `INSERT INTO applications (${columns}) VALUES (${placeholders})`,
        values
      );
      await get().fetchApplications();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create application' });
    }
  },

  updateApplication: async (id, updates) => {
    try {
      const db = await getDb();
      const snakeUpdates = keysToSnakeCase<Record<string, unknown>>(updates);
      const keys = Object.keys(snakeUpdates);
      const values = Object.values(snakeUpdates);

      if (keys.length > 0) {
        const setString = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
        await db.execute(
          `UPDATE applications SET ${setString}, updated_at = datetime('now') WHERE id = $${keys.length + 1}`,
          [...values, id]
        );
      }
      await get().fetchApplications();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update application' });
    }
  },

  deleteApplication: async (id) => {
    try {
      const db = await getDb();
      await db.execute('DELETE FROM applications WHERE id = $1', [id]);
      set(state => ({
        applications: state.applications.filter(a => a.id !== id)
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete application' });
    }
  },
}));