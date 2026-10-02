import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiCvGuardReport } from './AiCvGuardReport';
import { guardAiCv } from '../../lib/ai-cv-guard';
import { TEST_PROFILE, makeEntry } from '../../lib/test-helpers/cv-fixtures';

describe('AiCvGuardReport - dépassement', () => {
  const heavy = [
    ...Array.from({ length: 5 }, (_, i) => makeEntry(`e${i}`, 'experience', `Poste ${i}`, {
      startDate: '2012-01', endDate: '2014-01', description: Array.from({ length: 5 }, (_, k) => `- Action ${k} numéro ${i}`).join('\n'),
    })),
    makeEntry('hobby', 'interest', 'Escalade'),
    ...Array.from({ length: 22 }, (_, i) => makeEntry(`k${i}`, 'skill', `Skill${i}`)),
  ];

  it('affiche « Dépasse probablement 1 page » et la liste à retirer en priorité', () => {
    const { report } = guardAiCv({ entries: [], suggestedEntries: [] }, { entries: heavy, profile: TEST_PROFILE, pageBudget: 1 });
    const html = renderToStaticMarkup(<AiCvGuardReport report={report} />);
    expect(html).toContain('Dépasse probablement 1 page');
    expect(html).toContain('À retirer en priorité');
    expect(html).toContain('Escalade');
  });

  it('rien quand le volume tient', () => {
    const { report } = guardAiCv({ entries: [], suggestedEntries: [] }, { entries: [heavy[0]], profile: TEST_PROFILE, pageBudget: 1 });
    expect(renderToStaticMarkup(<AiCvGuardReport report={report} />)).not.toContain('Dépasse probablement');
  });
});
