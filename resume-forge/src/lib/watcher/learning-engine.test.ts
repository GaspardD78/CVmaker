import { describe, expect, it } from 'bun:test';
import { processFeedback } from './learning-engine';

const empty = { positive: {}, negative: {} };
const profile = {
  jobTitles: ['Chargé de recrutement', 'Talent Acquisition'],
  skills: ['sourcing', 'ATS'],
  domains: ['cybersécurité'],
};

describe('apprentissage négatif par type de poste, pas par domaine', () => {

  it('un rejet n\'apprend pas les termes des intitulés, skills ou domaines de la piste', () => {
    const dict = processFeedback('Ingénieur cybersécurité - développement sécurisé', 'thumbs_down', empty, profile);
    expect(dict.negative['cybersécurité']).toBeUndefined();
    // Le type de poste, lui, est appris.
    expect(dict.negative['ingénieur']).toBe(1);
  });

  it('les actions positives apprennent tous les termes (aucune protection)', () => {
    const dict = processFeedback('Chargé de recrutement IT', 'kanban_import', empty, profile);
    expect(dict.positive['recrutement']).toBe(2);
  });

  it('sans termes protégés, comportement inchangé', () => {
    const dict = processFeedback('Développeur Rust', 'quick_archive', empty);
    expect(dict.negative['développeur']).toBe(2);
  });
});
