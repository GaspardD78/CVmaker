import { create } from 'zustand';
import { Profile, MasterEntry } from '@/types/profile';
import { getDb } from '@/lib/db';
import { keysToCamelCase, keysToSnakeCase } from '@/lib/mapping';

interface ProfileState {
  profile: Profile | null;
  entries: MasterEntry[];
  isLoading: boolean;
  error: string | null;
  fetchProfile: () => Promise<void>;
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

  fetchProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDb();
      let rawProfiles = await db.select<any[]>('SELECT * FROM profiles LIMIT 1');

      if (rawProfiles.length === 0) {
        // Create an empty profile if none exists
        await db.execute(
          `INSERT INTO profiles (first_name, last_name, email) VALUES ($1, $2, $3)`,
          ['John', 'Doe', 'john.doe@example.com']
        );
        rawProfiles = await db.select<any[]>('SELECT * FROM profiles LIMIT 1');
      }

      if (rawProfiles.length > 0) {
        const rawProfile = rawProfiles[0];
        const profile = keysToCamelCase<Profile>(rawProfile);

        const rawEntries = await db.select<any[]>('SELECT * FROM master_entries WHERE profile_id = $1 ORDER BY sort_order ASC', [rawProfile.id]);
        const entries = rawEntries.map(e => keysToCamelCase<MasterEntry>(e));

        set({ profile, entries });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch profile' });
    } finally {
      set({ isLoading: false });
    }
  },

  updateProfile: async (updates) => {
    const current = get().profile;
    if (!current) return;
    try {
      const db = await getDb();
      const snakeUpdates = keysToSnakeCase<Record<string, any>>(updates);
      const keys = Object.keys(snakeUpdates);
      const values = Object.values(snakeUpdates);

      if (keys.length > 0) {
        const setString = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
        await db.execute(
          `UPDATE profiles SET ${setString}, updated_at = datetime('now') WHERE id = $${keys.length + 1}`,
          [...values, current.id]
        );
      }
      set({ profile: { ...current, ...updates } });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update profile' });
    }
  },

  addEntry: async (entry) => {
    try {
      const db = await getDb();
      const snakeEntry = keysToSnakeCase<Record<string, any>>(entry);
      const keys = Object.keys(snakeEntry);
      const values = Object.values(snakeEntry);

      const columns = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

      await db.execute(
        `INSERT INTO master_entries (${columns}) VALUES (${placeholders})`,
        values
      );

      // Reload profile entries
      await get().fetchProfile();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to add entry' });
    }
  },

  updateEntry: async (id, entryUpdates) => {
    try {
      const db = await getDb();
      const snakeUpdates = keysToSnakeCase<Record<string, any>>(entryUpdates);
      const keys = Object.keys(snakeUpdates);
      const values = Object.values(snakeUpdates);

      if (keys.length > 0) {
        const setString = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
        await db.execute(
          `UPDATE master_entries SET ${setString}, updated_at = datetime('now') WHERE id = $${keys.length + 1}`,
          [...values, id]
        );
      }
      await get().fetchProfile();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update entry' });
    }
  },

  deleteEntry: async (id) => {
    try {
      const db = await getDb();
      await db.execute('DELETE FROM master_entries WHERE id = $1', [id]);
      set(state => ({
        entries: state.entries.filter(e => e.id !== id)
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete entry' });
    }
  },
}));