import type { CVBlock } from '@/types/cv';
import type { MasterEntry } from '@/types/profile';
import { makeEntry } from './cv-fixtures';

/**
 * Profil fictif « compétences en catégories » (lib/skill-lines.ts) : une
 * section Compétences avec 4 catégories, 1 compétence isolée, puis une section
 * Centres d'intérêt. Aucune donnée réelle.
 */
export function makeCategoryEntries(): MasterEntry[] {
  return [
    makeEntry('k1', 'skill', 'Langages', { description: '- Python\n- SQL\n- Bash' }),
    makeEntry('k2', 'skill', 'Outils SOC', { description: '- Splunk\n- Elastic\n- Wireshark' }),
    makeEntry('k3', 'skill', 'Méthodes', { description: '- MITRE ATT&CK\n- Analyse de logs' }),
    makeEntry('k4', 'skill', 'Cloud', { description: '- Azure\n- Docker' }),
    makeEntry('k5', 'skill', 'Git'),
    makeEntry('i1', 'interest', 'Astronomie', { description: 'Observation du ciel en club amateur depuis 2015.' }),
  ];
}

const block = (id: string, order: number, extra: Partial<CVBlock>): CVBlock => ({
  id, cvId: 'cv1', entryId: null, blockType: 'entry_ref', sectionName: null, customContent: null,
  sortOrder: order, isVisible: true, overrideData: {}, createdAt: '', ...extra,
});

/** Blocs dans l'ordre : Compétences (k1..k5), Centres d'intérêt (i1). `format` = displayFormat de la section. */
export function makeCategoryBlocks(format = 'badges', overrides: Record<string, Record<string, unknown>> = {}): CVBlock[] {
  const header = (id: string, name: string, order: number) =>
    block(id, order, { blockType: 'section_header', sectionName: name, overrideData: { displayFormat: format } });
  const ref = (entryId: string, order: number) =>
    block(`b-${entryId}`, order, { entryId, overrideData: overrides[entryId] ?? {} });
  return [
    header('hs', 'Compétences', 0),
    ref('k1', 1), ref('k2', 2), ref('k3', 3), ref('k4', 4), ref('k5', 5),
    header('hi', "Centres d'intérêt", 6),
    ref('i1', 7),
  ];
}
