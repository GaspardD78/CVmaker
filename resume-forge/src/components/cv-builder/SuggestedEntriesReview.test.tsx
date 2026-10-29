import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SuggestedEntriesReview } from './SuggestedEntriesReview';

describe('SuggestedEntriesReview', () => {
  const suggestions = [
    { entryType: 'skill' as const, title: 'Accueil du public', reason: 'Cité dans le contexte additionnel' },
    { entryType: 'experience' as const, title: 'Mission ponctuelle', subtitle: 'Organisation fictive' },
  ];
  it('rien à afficher sans suggestion', () => {
    expect(renderToStaticMarkup(<SuggestedEntriesReview suggestions={[]} accepted={new Set()} onToggle={() => {}} />)).toBe('');
  });
  it('liste les suggestions, décochées par défaut, avec l\'avertissement opt-in', () => {
    const html = renderToStaticMarkup(<SuggestedEntriesReview suggestions={suggestions} accepted={new Set()} onToggle={() => {}} />);
    expect(html).toContain('Entrées suggérées hors profil maître');
    expect(html).toContain('Non cochées : ignorées (rien n&#x27;est écrit)');
    expect(html).toContain('Accueil du public');
    expect(html).toContain('Compétence');
    expect(html).toContain('Expérience');
    expect(html.match(/checked=""/g)).toBeNull();
  });
  it('les entrées acceptées sont cochées', () => {
    const html = renderToStaticMarkup(<SuggestedEntriesReview suggestions={suggestions} accepted={new Set([1])} onToggle={() => {}} />);
    expect(html.match(/checked=""/g)).toHaveLength(1);
  });
});
