import { create } from 'zustand';
import { getDb } from '@/lib/db';
import { createAngleRepo, type SqlPort } from '@/lib/cv-angle-repo';
import {
  MAX_ANGLES_PER_PROFILE, withAffinity, withoutAngleTags, entryTags,
  type Affinity, type CvAngle, type CvAngleFields,
} from '@/lib/cv-angles';
import { useProfileStore } from '@/stores/profileStore';

const repo = createAngleRepo(async () => (await getDb()) as unknown as SqlPort);

interface AngleState {
  angles: CvAngle[];
  /** Profil des angles chargés (null : rien de chargé). */
  profileId: string | null;
  isLoading: boolean;
  error: string | null;
  /** Charge les angles du profil (angles de départ créés si la bibliothèque est vide). */
  fetchAngles: (profileId: string) => Promise<void>;
  /** `true` tant que le plafond de 4 angles n'est pas atteint. */
  canAdd: () => boolean;
  createAngle: (profileId: string, fields: Omit<CvAngleFields, 'slug'> & { slug?: string }) => Promise<CvAngle | null>;
  updateAngle: (id: string, fields: Partial<Omit<CvAngleFields, 'slug'>>) => Promise<void>;
  /** Supprime l'angle et retire ses tags `angle:`/`hide:` des entrées (les autres étiquettes restent). */
  deleteAngle: (id: string) => Promise<void>;
  /** Écrit l'affinité d'une entrée pour un angle (tags de l'entrée). */
  setAffinity: (entryId: string, slug: string, affinity: Affinity) => Promise<void>;
  /** Écrit les tags complets de plusieurs entrées (import d'affinités), puis recharge le profil une fois. */
  writeTags: (updates: { entryId: string; tags: string[] }[]) => Promise<void>;
}

export const useAngleStore = create<AngleState>((set, get) => ({
  angles: [],
  profileId: null,
  isLoading: false,
  error: null,

  fetchAngles: async (profileId) => {
    set({ isLoading: true, error: null });
    try {
      set({ angles: await repo.listWithDefaults(profileId), profileId, isLoading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), isLoading: false });
    }
  },

  canAdd: () => get().angles.length < MAX_ANGLES_PER_PROFILE,

  createAngle: async (profileId, fields) => {
    const before = new Set(get().angles.map(a => a.id));
    const angles = await repo.create(profileId, fields);
    set({ angles, profileId });
    return angles.find(a => !before.has(a.id)) ?? null;
  },

  updateAngle: async (id, fields) => {
    await repo.update(id, fields);
    const { profileId } = get();
    if (profileId) set({ angles: await repo.list(profileId) });
  },

  deleteAngle: async (id) => {
    const angle = get().angles.find(a => a.id === id);
    await repo.remove(id);
    if (angle) {
      const updates = useProfileStore.getState().entries
        .map(e => ({ entryId: e.id, before: entryTags(e).length, tags: withoutAngleTags(entryTags(e), angle.slug) }))
        .filter(u => u.tags.length !== u.before);
      await get().writeTags(updates);
    }
    set({ angles: get().angles.filter(a => a.id !== id) });
  },

  setAffinity: async (entryId, slug, affinity) => {
    const { entries, updateEntry } = useProfileStore.getState();
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;
    await updateEntry(entryId, { tags: withAffinity(entryTags(entry), slug, affinity) });
  },

  writeTags: async (updates) => {
    if (updates.length === 0) return;
    const db = await getDb();
    for (const u of updates) {
      await db.execute(`UPDATE master_entries SET tags = ?1, updated_at = datetime('now') WHERE id = ?2`, [JSON.stringify(u.tags), u.entryId]);
    }
    await useProfileStore.getState().fetchProfile();
  },
}));
