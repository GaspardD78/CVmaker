import { create } from 'zustand';
import { Application, ApplicationEvent } from '@/types/application';
import { getDb } from '@/lib/db';
import { keysToCamelCase, keysToSnakeCase } from '@/lib/mapping';
import { filterAllowedColumns } from '@/lib/validation';

interface ApplicationState {
  applications: Application[];
  events: ApplicationEvent[];
  isLoading: boolean;
  error: string | null;
  fetchApplications: () => Promise<void>;
  createApplication: (app: Omit<Application, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateApplication: (id: string, updates: Partial<Application>) => Promise<void>;
  deleteApplication: (id: string) => Promise<void>;
  fetchEvents: (applicationId: string) => Promise<void>;
  createEvent: (event: Omit<ApplicationEvent, 'id' | 'createdAt'>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
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
      const snakeApp = filterAllowedColumns('applications', keysToSnakeCase<Record<string, unknown>>(app));
      const keys = Object.keys(snakeApp);
      const values = [...Object.values(snakeApp)];

      const columns = keys.join(', ');
      const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ');

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
      const snakeUpdates = filterAllowedColumns('applications', keysToSnakeCase<Record<string, unknown>>(updates));
      const keys = Object.keys(snakeUpdates);
      const values = [...Object.values(snakeUpdates)];

      if (keys.length > 0) {
        const setString = keys.map((key, i) => `${key} = ?${i + 1}`).join(', ');
        await db.execute(
          `UPDATE applications SET ${setString}, updated_at = datetime('now') WHERE id = ?${keys.length + 1}`,
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
      await db.execute('DELETE FROM applications WHERE id = ?1', [id]);
      set(state => ({
        applications: state.applications.filter(a => a.id !== id)
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete application' });
    }
  },

  fetchEvents: async (applicationId) => {
    try {
      const db = await getDb();
      const rawEvents = await db.select<Record<string, unknown>[]>(
        'SELECT * FROM application_events WHERE application_id = ?1 ORDER BY event_date DESC',
        [applicationId]
      );
      const events = rawEvents.map(event => keysToCamelCase<ApplicationEvent>(event));
      set({ events });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch events' });
    }
  },

  createEvent: async (event) => {
    try {
      const db = await getDb();
      const snakeEvent = filterAllowedColumns('application_events', keysToSnakeCase<Record<string, unknown>>(event));
      const keys = Object.keys(snakeEvent);
      const values = [...Object.values(snakeEvent)];

      const columns = keys.join(', ');
      const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ');

      await db.execute(
        `INSERT INTO application_events (${columns}) VALUES (${placeholders})`,
        values
      );
      await get().fetchEvents(event.applicationId);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create event' });
    }
  },

  deleteEvent: async (id) => {
    try {
      const db = await getDb();
      const currentEvents = get().events;
      const eventToDelete = currentEvents.find(e => e.id === id);

      await db.execute('DELETE FROM application_events WHERE id = ?1', [id]);

      if (eventToDelete) {
        set(state => ({
          events: state.events.filter(e => e.id !== id)
        }));
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete event' });
    }
  },
}));