import type { CVBlock } from '@/types/cv';
import type { EntryType, MasterEntry, Profile } from '@/types/profile';
import type { CvBlockPort } from '../apply-ai-cv';

/** Fixtures et store factice partagés par les tests du moteur de CV (aucune base de données). */

export const TEST_PROFILE: Profile = {
  id: 'p1', firstName: 'Camille', lastName: 'Durand', email: 'camille@example.com', phone: null,
  address: null, city: 'Lyon', postalCode: null, country: 'France', linkedinUrl: null, githubUrl: null,
  portfolioUrl: null, photoPath: null, title: 'Analyste SOC', summary: 'Analyste cybersécurité.',
  createdAt: '', updatedAt: '',
};

export function makeEntry(id: string, entryType: EntryType, title: string, extra: Partial<MasterEntry> = {}): MasterEntry {
  return {
    id, profileId: 'p1', entryType, title, subtitle: null, location: null, startDate: null, endDate: null,
    isCurrent: false, description: null, metadata: {}, sortOrder: 0, tags: [], createdAt: '', updatedAt: '',
    ...extra,
  };
}

export const SKILL_TITLES = ['Splunk', 'Python', 'Wireshark', 'Nmap', 'Docker', 'Linux', 'Git', 'Bash', 'Elastic', 'MITRE ATT&CK'];

/** Profil type : 2 expériences, 1 formation, 10 compétences, 1 certification, 2 langues. */
export function makeEntries(): MasterEntry[] {
  return [
    makeEntry('x1', 'experience', 'Analyste SOC', {
      subtitle: 'ACME', startDate: '2021-01', endDate: null, isCurrent: true,
      description: '- Supervision de 12 sources de logs avec Splunk\n- Réduction du temps de traitement de 30 %',
    }),
    makeEntry('x2', 'experience', 'Technicien support', {
      subtitle: 'Globex', startDate: '2018-09', endDate: '2020-12',
      description: '- Support de niveau 2 pour 200 utilisateurs',
    }),
    makeEntry('f1', 'education', 'Master Cybersécurité', { subtitle: 'Université de Lyon', startDate: '2016', endDate: '2018' }),
    ...SKILL_TITLES.map((t, i) => makeEntry(`s${i + 1}`, 'skill', t)),
    makeEntry('c1', 'certification', 'CompTIA Security+', { subtitle: 'CompTIA', startDate: '2022' }),
    makeEntry('l1', 'language', 'Français', { subtitle: 'Langue maternelle' }),
    makeEntry('l2', 'language', 'Anglais', { subtitle: 'Courant - C1' }),
  ];
}

const SECTION_LABELS: Record<string, string> = {
  experience: 'Expériences Professionnelles', education: 'Formations', skill: 'Compétences',
  certification: 'Certifications', language: 'Langues',
};

/** Blocs d'un CV fraîchement créé (même structure que `createCv` : un en-tête par type). */
export function makeBlocks(entries: MasterEntry[], cvId = 'cv1'): CVBlock[] {
  const blocks: CVBlock[] = [];
  let order = 0;
  for (const type of ['experience', 'education', 'skill', 'certification', 'language']) {
    const list = entries.filter(e => e.entryType === type);
    if (list.length === 0) continue;
    blocks.push({
      id: `h-${type}`, cvId, entryId: null, blockType: 'section_header', sectionName: SECTION_LABELS[type],
      customContent: null, sortOrder: order++, isVisible: true, overrideData: {}, createdAt: '',
    });
    for (const e of list) {
      blocks.push({
        id: `b-${e.id}`, cvId, entryId: e.id, blockType: 'entry_ref', sectionName: null, customContent: null,
        sortOrder: order++, isVisible: true, overrideData: {}, createdAt: '',
      });
    }
  }
  return blocks;
}

export interface FakeStore extends CvBlockPort {
  settings: Record<string, unknown>;
  /** Blocs triés par `sortOrder`. */
  sorted(): CVBlock[];
}

/** Store en mémoire respectant le contrat de `CvBlockPort` (ids générés, tri par `reorderCvBlocks`). */
export function makeFakeStore(initial: CVBlock[], settings: Record<string, unknown> = {}): FakeStore {
  let seq = 0;
  const store: FakeStore = {
    currentCvBlocks: initial.map(b => ({ ...b })),
    settings: { ...settings },
    async fetchCvBlocks() { /* déjà en mémoire */ },
    async updateCvBlock(id, updates) {
      store.currentCvBlocks = store.currentCvBlocks.map(b => (b.id === id ? { ...b, ...updates } : b));
    },
    async createCvBlock(block) {
      store.currentCvBlocks = [...store.currentCvBlocks, { ...block, id: `new-${++seq}`, createdAt: '' }];
    },
    async deleteCvBlock(id) {
      store.currentCvBlocks = store.currentCvBlocks.filter(b => b.id !== id);
    },
    async reorderCvBlocks(_cvId, ids) {
      store.currentCvBlocks = store.currentCvBlocks.map(b => ({ ...b, sortOrder: ids.indexOf(b.id) }));
    },
    getCvSettings() {
      return store.settings;
    },
    async updateCvSettings(_cvId, patch) {
      store.settings = { ...store.settings, ...patch };
    },
    sorted() {
      return [...store.currentCvBlocks].sort((a, b) => a.sortOrder - b.sortOrder);
    },
  };
  return store;
}
