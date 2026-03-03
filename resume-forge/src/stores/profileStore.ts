import { create } from 'zustand';
import { Profile, MasterEntry } from '@/types/profile';
import { getDb } from '@/lib/db';

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
      const profiles = await db.select<Profile[]>('SELECT * FROM profiles LIMIT 1');
      if (profiles.length > 0) {
        const profile = profiles[0];
        const entries = await db.select<MasterEntry[]>('SELECT * FROM master_entries WHERE profile_id = $1 ORDER BY sort_order ASC', [profile.id]);
        set({ profile, entries });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch profile' });
    } finally {
      set({ isLoading: false });
    }
  },

  updateProfile: async (updates) => {
    // Basic placeholder implementation
    const current = get().profile;
    if (!current) return;
    try {
      // update db...
      set({ profile: { ...current, ...updates } });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update profile' });
    }
  },

  addEntry: async (_entry) => {
    // insert db...
  },

  updateEntry: async (_id, _entry) => {
    // update db...
  },

  deleteEntry: async (_id) => {
    // delete db...
  },
}));