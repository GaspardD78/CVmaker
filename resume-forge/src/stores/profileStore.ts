import { create } from 'zustand';
import { Profile, MasterEntry } from '@/types/profile';
import { getDb } from '@/lib/db';
import { keysToCamelCase, keysToSnakeCase } from '@/lib/mapping';
import { filterAllowedColumns } from '@/lib/validation';

/**
 * Serializes all DB write operations to prevent concurrent SQLite writes.
 * Same pattern as cvStore to avoid "database is locked" errors.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const task = writeQueue.then(() => fn(), () => fn());
  writeQueue = task.then(() => {}, () => {});
  return task as Promise<T>;
}

interface ProfileState {
  profile: Profile | null;
  entries: MasterEntry[];
  isLoading: boolean;
  error: string | null;
  fetchProfile: (profileId?: string) => Promise<void>;
  fetchAllProfiles: () => Promise<Profile[]>;
  updateProfile: (profile: Partial<Profile>) => Promise<void>;
  addEntry: (entry: Omit<MasterEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateEntry: (id: string, entry: Partial<MasterEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  entries: [],
  isLoading: false,
  error: null,

  fetchProfile: async (profileId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDb();

      // If a specific profileId is provided, use it; otherwise try authStore or fallback to LIMIT 1
      let rawProfiles: Record<string, unknown>[];
      if (profileId) {
        rawProfiles = await db.select<Record<string, unknown>[]>('SELECT * FROM profiles WHERE id = ?1', [profileId]);
      } else {
        // Try to get currentUserId from authStore (lazy import to avoid circular deps)
        const { useAuthStore } = await import('@/stores/authStore');
        const currentUserId = useAuthStore.getState().currentUserId;
        if (currentUserId) {
          rawProfiles = await db.select<Record<string, unknown>[]>('SELECT * FROM profiles WHERE id = ?1', [currentUserId]);
        } else {
          rawProfiles = await db.select<Record<string, unknown>[]>('SELECT * FROM profiles LIMIT 1');
        }
      }

      if (rawProfiles.length === 0) {
        set({ profile: null, entries: [] });
        return;
      }

      const rawProfile = rawProfiles[0];
      const profile = keysToCamelCase<Profile>(rawProfile);

      const rawEntries = await db.select<Record<string, unknown>[]>('SELECT * FROM master_entries WHERE profile_id = ?1 ORDER BY sort_order ASC', [rawProfile.id as string]);
      const entries = rawEntries.map(e => keysToCamelCase<MasterEntry>(e));

      set({ profile, entries });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch profile' });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchAllProfiles: async () => {
    try {
      const db = await getDb();
      const rawProfiles = await db.select<Record<string, unknown>[]>('SELECT * FROM profiles ORDER BY first_name ASC');
      return rawProfiles.map(p => keysToCamelCase<Profile>(p));
    } catch {
      return [];
    }
  },

  updateProfile: (updates) => enqueueWrite(async () => {
    const current = get().profile;

    try {
      const db = await getDb();
      const snakeUpdates = filterAllowedColumns('profiles', keysToSnakeCase<Record<string, unknown>>(updates));

      // Ensure required NOT NULL columns have defaults to avoid SQLite constraint failure
      if (!current) {
        if (!('first_name' in snakeUpdates) || (snakeUpdates as any).first_name === '') snakeUpdates.first_name = 'Prénom';
        if (!('last_name' in snakeUpdates) || (snakeUpdates as any).last_name === '') snakeUpdates.last_name = 'Nom';
      }

      const keys = Object.keys(snakeUpdates);
      const values = [...Object.values(snakeUpdates)];

      if (!current) {
        // If profile doesn't exist, we must create it instead
        const columns = keys.join(', ');
        const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ');

        await db.execute(
          `INSERT INTO profiles (${columns}) VALUES (${placeholders})`,
          values
        );
        await get().fetchProfile();
        return;
      }

      if (keys.length > 0) {
        const setString = keys.map((key, i) => `${key} = ?${i + 1}`).join(', ');
        await db.execute(
          `UPDATE profiles SET ${setString}, updated_at = datetime('now') WHERE id = ?${keys.length + 1}`,
          [...values, current.id]
        );
      }
      set({ profile: { ...current, ...updates } });
    } catch (err) {
      const errorMessage = typeof err === 'string' ? err : (err instanceof Error ? err.message : 'Failed to update profile');
      console.error("Erreur SQL complète :", err);
      set({ error: errorMessage });
      throw err;
    }
  }),

  addEntry: (entry) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      const snakeEntry = filterAllowedColumns('master_entries', keysToSnakeCase<Record<string, unknown>>(entry));
      const keys = Object.keys(snakeEntry);
      const values = [...Object.values(snakeEntry)];

      const columns = keys.join(', ');
      const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ');

      await db.execute(
        `INSERT INTO master_entries (${columns}) VALUES (${placeholders})`,
        values
      );

      // Reload profile entries
      await get().fetchProfile();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add entry';
      set({ error: message });
      throw err;
    }
  }),

  updateEntry: (id, entryUpdates) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      const snakeUpdates = filterAllowedColumns('master_entries', keysToSnakeCase<Record<string, unknown>>(entryUpdates));
      const keys = Object.keys(snakeUpdates);
      const values = [...Object.values(snakeUpdates)];

      if (keys.length > 0) {
        const setString = keys.map((key, i) => `${key} = ?${i + 1}`).join(', ');
        await db.execute(
          `UPDATE master_entries SET ${setString}, updated_at = datetime('now') WHERE id = ?${keys.length + 1}`,
          [...values, id]
        );
      }

      // Optimistic local update before re-fetching
      set(state => ({
        entries: state.entries.map(e =>
          e.id === id ? { ...e, ...entryUpdates } : e
        )
      }));

      await get().fetchProfile();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update entry';
      set({ error: message });
      throw err;
    }
  }),

  deleteEntry: (id) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      await db.execute('DELETE FROM master_entries WHERE id = ?1', [id]);
      set(state => ({
        entries: state.entries.filter(e => e.id !== id)
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete entry';
      set({ error: message });
      throw err;
    }
  }),
}));
