import { describe, expect, it } from 'bun:test';
import { isProtectedTerm, processFeedback, protectedTokensOf } from './learning-engine';

const empty = { positive: {}, negative: {} };
const profile = {
  jobTitles: ['Chargé de recrutement', 'Talent Acquisition'],
  skills: ['sourcing', 'ATS'],
  domains: ['cybersécurité'],
};

describe('apprentissage négatif par type de poste, pas par domaine', () => {
  const protectedTokens = protectedTokensOf(profile);

  it('un rejet n\'apprend pas les termes des intitulés, skills ou domaines de la piste', () => {
    const dict = processFeedback('Ingénieur cybersécurité - développement sécurisé', 'thumbs_down', empty, protectedTokens);
    expect(dict.negative['cybersécurité']).toBeUndefined();
    // Le type de poste, lui, est appris.
    expect(dict.negative['ingénieur']).toBe(1);
  });

  it('un bigramme dont un mot est protégé est protégé', () => {
    expect(isProtectedTerm('chargé recrutement', protectedTokens)).toBe(true);
    expect(isProtectedTerm('développeur rust', protectedTokens)).toBe(false);
  });

  it('les actions positives apprennent tous les termes (aucune protection)', () => {
    const dict = processFeedback('Chargé de recrutement IT', 'kanban_import', empty, protectedTokens);
    expect(dict.positive['recrutement']).toBe(2);
  });

  it('sans termes protégés, comportement inchangé', () => {
    const dict = processFeedback('Développeur Rust', 'quick_archive', empty);
    expect(dict.negative['développeur']).toBe(2);
  });
});
