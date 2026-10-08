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

describe('apprentissage : contrat et lieu jamais négatifs', () => {
  const ta = {
    jobTitles: ['Talent Acquisition Partner'],
    location: { label: 'Paris (75)', city: 'Paris', inseeCode: '75056', departmentCodes: ['75'], radiusKm: 30 },
  };

  it('« TA Specialist - Paris - CDI » n\'apprend ni paris ni cdi', () => {
    const out = processFeedback('TA Specialist - Paris - CDI', 'thumbs_down', empty, ta);
    expect(out.negative.paris).toBeUndefined();
    expect(out.negative.cdi).toBeUndefined();
    expect(out.negative['specialist paris']).toBeUndefined();
    expect(out.negative['paris cdi']).toBeUndefined();
    expect(out.negative.specialist).toBe(1);
  });

  it('protège aussi un lieu de la zone absent de la liste par défaut', () => {
    const lyon = { ...ta, location: { ...ta.location, label: 'Lyon (69)', city: 'Lyon' } };
    const out = processFeedback('Recruteur Lyon', 'quick_archive', empty, lyon);
    expect(out.negative.lyon).toBeUndefined();
    expect(out.negative.recruteur).toBe(2);
  });

  it('sans profil, les contrats restent protégés', () => {
    const out = processFeedback('Chargé CDD', 'thumbs_down', empty, null);
    expect(out.negative.cdd).toBeUndefined();
  });

  it('l\'apprentissage positif n\'est pas affecté', () => {
    const out = processFeedback('TA Specialist - Paris - CDI', 'thumbs_up', empty, ta);
    expect(out.positive.cdi).toBe(1);
  });
});
