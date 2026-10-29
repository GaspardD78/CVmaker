import { describe, expect, it } from 'bun:test';
import { appendEntriesToCv, promoteSuggestedEntries } from './suggested-entries';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import type { AiCvSuggestedEntry } from './ai-cv-response';
import type { MasterEntry } from '@/types/profile';
import type { CVBlock } from '@/types/cv';

const S = (title: string): AiCvSuggestedEntry => ({ entryType: 'skill', title, subtitle: 'Organisation fictive', description: '- point' });

describe('promoteSuggestedEntries : seul ce qui est accepté est écrit', () => {
  it('écrit les entrées acceptées dans le profil maître et renvoie leurs identifiants', async () => {
    const written: Partial<MasterEntry>[] = [];
    useProfileStore.setState({
      entries: [],
      addEntry: async (e: Partial<MasterEntry>) => {
        written.push(e);
        useProfileStore.setState({ entries: [...useProfileStore.getState().entries, { ...e, id: `n${written.length}` } as MasterEntry] });
      },
    } as never);
    const ids = await promoteSuggestedEntries('p1', [S('Accueil'), S('Médiation')]);
    expect(ids).toEqual(['n1', 'n2']);
    expect(written.map(w => w.title)).toEqual(['Accueil', 'Médiation']);
    expect(written[0]).toMatchObject({ profileId: 'p1', entryType: 'skill', subtitle: 'Organisation fictive', location: null, isCurrent: false });
  });

  it('aucune acceptée : rien n\'est écrit', async () => {
    let calls = 0;
    useProfileStore.setState({ entries: [], addEntry: async () => { calls++; } } as never);
    expect(await promoteSuggestedEntries('p1', [])).toEqual([]);
    expect(calls).toBe(0);
  });
});

describe('appendEntriesToCv', () => {
  it('ajoute un bloc visible par entrée à la fin du CV', async () => {
    const created: Omit<CVBlock, 'id' | 'createdAt'>[] = [];
    useCvStore.setState({
      currentCvBlocks: [{ id: 'b1', sortOrder: 7 } as CVBlock],
      fetchCvBlocks: async () => {},
      createCvBlock: async (b: Omit<CVBlock, 'id' | 'createdAt'>) => { created.push(b); },
    } as never);
    await appendEntriesToCv('cv1', ['n1', 'n2']);
    expect(created.map(c => [c.entryId, c.sortOrder, c.isVisible, c.blockType])).toEqual([['n1', 8, true, 'entry_ref'], ['n2', 9, true, 'entry_ref']]);
    created.length = 0;
    await appendEntriesToCv('cv1', []);
    expect(created).toEqual([]);
  });
});
