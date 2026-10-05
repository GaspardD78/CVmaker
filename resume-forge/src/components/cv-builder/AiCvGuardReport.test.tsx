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

describe('AiCvGuardReport - alertes de cohérence et angle', () => {
  const entries = [makeEntry('x', 'experience', 'Poste fictif', { startDate: '2022-01', isCurrent: true, description: '- Action' })];
  const analyse = { indispensables: [], importants: [], correspondances: [], ecarts: [] };

  it('affiche les alertes_cap sans bloquer (aucune erreur)', () => {
    const { report } = guardAiCv(
      { entries: [], suggestedEntries: [], analyse: { ...analyse, alertesCap: ['4 jours sur site exigés'] } },
      { entries, profile: TEST_PROFILE, pageBudget: 2 },
    );
    expect(report.metrics.alertesCap).toEqual(['4 jours sur site exigés']);
    expect(report.errors).toHaveLength(0);
    const html = renderToStaticMarkup(<AiCvGuardReport report={report} />);
    expect(html).toContain('L&#x27;annonce contredit tes critères de recherche');
    expect(html).toContain('4 jours sur site exigés');
  });

  it('rien sans alerte ; angle appliqué affiché', () => {
    const angle = { slug: 'a', label: 'Angle fictif', titleRule: 'profile' as const, summaryStructure: '', skillCategoryOrder: [], vocabulary: '', olderPolicy: 'one-line' as const, leadEntryIds: [], hideEntryIds: [] };
    const { report } = guardAiCv({ entries: [], suggestedEntries: [], analyse }, { entries, profile: TEST_PROFILE, pageBudget: 2, angle });
    const html = renderToStaticMarkup(<AiCvGuardReport report={report} />);
    expect(html).not.toContain('ai-cv-alertes-cap');
    expect(html).toContain('Angle fictif');
  });
});
