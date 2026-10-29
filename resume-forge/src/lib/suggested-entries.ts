import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import type { AiCvSuggestedEntry } from './ai-cv-response';

/**
 * Écrit dans le profil maître les suggestions hors profil ACCEPTÉES par l'utilisateur (opt-in explicite :
 * rien n'est écrit pour les autres). Renvoie les identifiants des nouvelles entrées, repérés en comparant
 * le store avant et après.
 */
export async function promoteSuggestedEntries(profileId: string, accepted: readonly AiCvSuggestedEntry[]): Promise<string[]> {
  if (accepted.length === 0) return [];
  const addEntry = useProfileStore.getState().addEntry;
  const beforeIds = new Set(useProfileStore.getState().entries.map(e => e.id));
  for (const s of accepted) {
    await addEntry({
      profileId,
      entryType: s.entryType,
      title: s.title,
      subtitle: s.subtitle ?? null,
      location: null,
      startDate: s.startDate ?? null,
      endDate: s.endDate ?? null,
      isCurrent: s.isCurrent ?? false,
      description: s.description ?? null,
      metadata: {},
      sortOrder: 0,
      tags: [],
    });
  }
  return useProfileStore.getState().entries.filter(e => !beforeIds.has(e.id)).map(e => e.id);
}

/** Ajoute un bloc visible par entrée à la fin d'un CV existant (un CV déjà créé n'importe pas seul les nouvelles entrées). */
export async function appendEntriesToCv(cvId: string, entryIds: readonly string[]): Promise<void> {
  if (entryIds.length === 0) return;
  await useCvStore.getState().fetchCvBlocks(cvId);
  let maxSort = useCvStore.getState().currentCvBlocks.reduce((m, b) => Math.max(m, b.sortOrder), 0);
  for (const entryId of entryIds) {
    maxSort += 1;
    await useCvStore.getState().createCvBlock({
      cvId, entryId, blockType: 'entry_ref', sectionName: null, customContent: null,
      sortOrder: maxSort, isVisible: true, overrideData: {},
    });
  }
}
