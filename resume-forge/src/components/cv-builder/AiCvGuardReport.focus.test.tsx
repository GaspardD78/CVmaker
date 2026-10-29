import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiCvGuardReport } from './AiCvGuardReport';
import { guardAiCv } from '@/lib/ai-cv-guard';
import { TEST_PROFILE, makeEntries } from '@/lib/test-helpers/cv-fixtures';

const html = (focus?: 'missions' | 'resultats') => {
  const { report } = guardAiCv(
    { entries: [], suggestedEntries: [], warnings: ['Poste X : quels profils, quels interlocuteurs ?'] },
    { entries: makeEntries(), profile: TEST_PROFILE, focus },
  );
  return renderToStaticMarkup(<AiCvGuardReport report={report} />);
};

describe('AiCvGuardReport : libellé des questions de l\'IA', () => {
  it('missions : « Périmètres à préciser »', () => {
    expect(html('missions')).toContain('Périmètres à préciser');
  });
  it('resultats ou absent : affichage historique, sans titre', () => {
    expect(html('resultats')).not.toContain('Périmètres à préciser');
    expect(html()).not.toContain('Périmètres à préciser');
    expect(html()).toContain('quels interlocuteurs');
  });
});
