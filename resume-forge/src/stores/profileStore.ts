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
  reset: () => void;
  fetchProfile: (profileId?: string) => Promise<void>;
  fetchAllProfiles: () => Promise<Profile[]>;
  updateProfile: (profile: Partial<Profile>) => Promise<void>;
  addEntry: (entry: Omit<MasterEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateEntry: (id: string, entry: Partial<MasterEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  entries: [],
  isLoading: false,
  error: null,

  reset: () => set({ profile: null, entries: [], isLoading: false, error: null }),

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
    const SECTION_LABELS: Record<string, string[]> = {
      experience: ['Expériences Professionnelles', 'Expérience professionnelle', 'Expériences'],
      education: ['Formations', 'Formation', 'Éducation'],
      skill: ['Compétences', 'Compétence', 'Skills'],
      certification: ['Certifications', 'Certification'],
      language: ['Langues', 'Langue', 'Languages'],
      project: ['Projets', 'Projet', 'Projects'],
      interest: ['Centres d\'intérêt', 'Centres d’intérêt', 'Loisirs', 'Intérêts'],
      volunteer: ['Bénévolat', 'Engagement associatif'],
    };

    try {
      const db = await getDb();

      // Detect entry type change before writing
      const currentEntry = get().entries.find(e => e.id === id);
      const newType = entryUpdates.entryType;
      const typeIsChanging = !!newType && !!currentEntry && newType !== currentEntry.entryType;

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

      // If entry type changed, move the entry_ref blocks to the correct section in each CV
      if (typeIsChanging && newType) {
        const affectedBlocks = await db.select<{ id: string; cv_id: string }[]>(
          'SELECT id, cv_id FROM cv_blocks WHERE entry_id = ?1',
          [id]
        );

        for (const entryBlock of affectedBlocks) {
          const cvId = entryBlock.cv_id;

          type RawBlock = { id: string; block_type: string; section_name: string | null; sort_order: number; override_data: string };
          const allBlocks = await db.select<RawBlock[]>(
            'SELECT id, block_type, section_name, sort_order, override_data FROM cv_blocks WHERE cv_id = ?1 ORDER BY sort_order ASC',
            [cvId]
          );

          // Find target section header for the new type (by name match)
          const possibleLabels = SECTION_LABELS[newType as string] || [];
          const defaultLabel = possibleLabels.length > 0 ? possibleLabels[0] : null;
          let targetSectionIdx = -1;
          for (let k = 0; k < allBlocks.length; k++) {
            const b = allBlocks[k];
            if (b.block_type !== 'section_header') continue;

            // Compare case insensitive to find matching section
            const bName = (b.section_name || '').toLowerCase();
            if (possibleLabels.some(l => bName === l.toLowerCase() || bName.includes(l.toLowerCase()))) {
              targetSectionIdx = k;
              break;
            }
          }

          if (targetSectionIdx === -1) {
            // No matching section — create one at the end of the CV
            const maxSortOrder = allBlocks.length > 0 ? allBlocks[allBlocks.length - 1].sort_order : -1;
            await db.execute(
              `INSERT INTO cv_blocks (cv_id, entry_id, block_type, section_name, custom_content, sort_order, is_visible, override_data) VALUES (?1, NULL, 'section_header', ?2, NULL, ?3, 1, '{}')`,
              [cvId, defaultLabel, maxSortOrder + 1]
            );

            // We need to move the entry block to the end as well
            const blockCurrentIdx = allBlocks.findIndex(b => b.id === entryBlock.id);
            if (blockCurrentIdx !== -1) {
                const reordered = allBlocks.filter(b => b.id !== entryBlock.id);
                reordered.push(allBlocks[blockCurrentIdx]); // Move to end

                for (let k = 0; k < reordered.length; k++) {
                  await db.execute('UPDATE cv_blocks SET sort_order = ?1 WHERE id = ?2', [k, reordered[k].id]);
                }
            } else {
                await db.execute(
                  'UPDATE cv_blocks SET sort_order = ?1 WHERE id = ?2',
                  [maxSortOrder + 2, entryBlock.id]
                );
            }
          } else {
            // Find the last entry_ref in the target section
            let insertAfterIdx = targetSectionIdx;
            for (let k = targetSectionIdx + 1; k < allBlocks.length; k++) {
              if (allBlocks[k].block_type === 'section_header') break;
              insertAfterIdx = k;
            }

            const blockCurrentIdx = allBlocks.findIndex(b => b.id === entryBlock.id);
            if (blockCurrentIdx === insertAfterIdx + 1 || blockCurrentIdx === insertAfterIdx) continue;

            // Rebuild sort_order: remove from current position, insert after target section's last entry
            const reordered = allBlocks.filter(b => b.id !== entryBlock.id);
            const adjustedInsert = blockCurrentIdx < insertAfterIdx ? insertAfterIdx - 1 : insertAfterIdx;
            reordered.splice(adjustedInsert + 1, 0, allBlocks[blockCurrentIdx]);

            for (let k = 0; k < reordered.length; k++) {
              await db.execute('UPDATE cv_blocks SET sort_order = ?1 WHERE id = ?2', [k, reordered[k].id]);
            }
          }
        }

        // Refresh currently open CV blocks so the builder reflects the change immediately
        try {
          const { useCvStore } = await import('@/stores/cvStore');
          const currentCv = useCvStore.getState().currentCv;
          if (currentCv) {
            await useCvStore.getState().fetchCvBlocks(currentCv.id);
          }
        } catch {
          // Non-critical — the builder will refresh on next load
        }
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

  deleteProfile: (profileId) => enqueueWrite(async () => {
    try {
      const db = await getDb();
      await db.execute('DELETE FROM profiles WHERE id = ?1', [profileId]);

      // If we just deleted the current profile, reset local state
      const current = get().profile;
      if (current && current.id === profileId) {
        set({ profile: null, entries: [] });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete profile';
      set({ error: message });
      throw err;
    }
  }),
}));
