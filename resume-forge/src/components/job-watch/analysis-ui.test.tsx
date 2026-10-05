import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisPatchPanel } from './AnalysisPatchPanel';
import { LearnedSignalsPanel } from './LearnedSignalsPanel';
import { DEFAULT_SEARCH_PROFILE, type JobWatchAlert } from '@/types/job-watch';

const alert: JobWatchAlert = {
  id: 'a1', name: 'Cœur', color: '#6366f1', kind: 'core', position: 0, enabled: 1,
  searchProfile: { ...DEFAULT_SEARCH_PROFILE, jobTitles: ['Responsable cybersécurité'] },
  aiFilterRule: null,
  learnedDict: { positive: {}, negative: { 'cybersécurité': 6, btp: 4, rare: 1 } },
  companyReputation: {}, learnedDecayedAt: null, lastFetchedAt: null, createdAt: '', sources: [],
};

describe('interface de l\'analyse IA (rendu initial)', () => {
  it('signaux appris : compteur, conflit avec le profil marqué, termes rares masqués', () => {
    const html = renderToStaticMarkup(<LearnedSignalsPanel alert={alert} />);
    expect(html).toContain('cybersécurité');
    expect(html).toContain('×6');
    expect(html).toContain('signal probablement trompeur');
    expect(html).toContain('btp');
    expect(html).not.toContain('rare');
    expect(html).toContain('Oublier cybersécurité');
  });
  it('signaux appris : rien à afficher sans signal', () => {
    expect(renderToStaticMarkup(<LearnedSignalsPanel alert={{ ...alert, learnedDict: { positive: {}, negative: {} } }} />)).toBe('');
  });
  it('panneau d\'application : bouton présent, zone de collage repliée', () => {
    const html = renderToStaticMarkup(<AnalysisPatchPanel alert={alert} />);
    expect(html).toContain('Appliquer les recommandations');
    expect(html).not.toContain('textarea');
  });
});
