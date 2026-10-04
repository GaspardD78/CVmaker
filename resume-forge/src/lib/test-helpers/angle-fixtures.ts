import type { MasterEntry } from '@/types/profile';
import type { AngleSpec } from '../cv-angles';
import { makeEntry } from './cv-fixtures';

/** Profil fictif avec tags d'angle (aucune donnée réelle). */
export function makeAngleEntries(): MasterEntry[] {
  return [
    makeEntry('x1', 'experience', 'Analyste SOC (Acme)', {
      subtitle: 'Acme', startDate: '2021-01', isCurrent: true,
      description: '- Supervision de 12 sources de logs avec Splunk', tags: ['angle:soc', 'UX/UI'],
    }),
    makeEntry('x2', 'experience', 'Technicien support', {
      subtitle: 'Globex', startDate: '2016-01', endDate: '2018-12',
      description: '- Support de niveau 2', tags: ['hide:soc'],
    }),
    makeEntry('x3', 'experience', 'Animateur', { subtitle: 'Club fictif', startDate: '2010-01', endDate: '2012-01', tags: ['hide:soc'] }),
    makeEntry('k1', 'skill', 'Outils SOC', { description: '- Splunk\n- Elastic', tags: ['angle:soc'] }),
    makeEntry('k2', 'skill', 'Langages', { description: '- Python\n- Bash' }),
    makeEntry('i1', 'interest', 'Astronomie', { tags: ['hide:soc'] }),
  ];
}

export const SOC_ANGLE: AngleSpec = {
  slug: 'soc',
  label: 'Analyste SOC',
  titleRule: 'profile',
  summaryStructure: '{intitulé} depuis {année}, {outils de détection}, {preuve chiffrée}',
  skillCategoryOrder: ['Outils SOC', 'Inexistante', 'Langages'],
  vocabulary: 'Vocabulaire de la détection. Aucun sigle non défini.',
  olderPolicy: 'one-line',
  leadEntryIds: ['x1', 'k1'],
  hideEntryIds: ['x2', 'x3', 'i1'],
};
