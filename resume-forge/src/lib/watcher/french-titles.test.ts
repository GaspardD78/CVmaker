import { describe, expect, it } from 'bun:test';
import { frenchJobTitles, isFrenchJobTitle } from './french-titles';

describe('intitulés français', () => {
  it('écarte les intitulés anglais du recrutement', () => {
    for (const t of ['Talent Acquisition', 'Talent Acquisition Specialist', 'Tech Recruiter', 'Senior Sourcer', 'HRBP']) {
      expect(isFrenchJobTitle(t)).toBe(false);
    }
  });

  it('garde les intitulés français, même avec un mot anglais', () => {
    for (const t of ['Chargé de recrutement IT', 'Recruteur', 'Responsable Talent Acquisition', 'RRH', 'Sourceur', 'Gestionnaire RH']) {
      expect(isFrenchJobTitle(t)).toBe(true);
    }
  });

  it('un intitulé inconnu est conservé (bénéfice du doute)', () => {
    expect(isFrenchJobTitle('Chasseur de têtes')).toBe(true);
    expect(isFrenchJobTitle('Sourcing')).toBe(true);
  });

  it('frenchJobTitles filtre, dédoublonne et ignore les vides', () => {
    expect(frenchJobTitles(['Talent Acquisition', 'Recruteur', 'recruteur', '  ', 'Tech Recruiter', 'Chargé de recrutement']))
      .toEqual(['Recruteur', 'Chargé de recrutement']);
  });

  it('aucun intitulé français → liste vide', () => {
    expect(frenchJobTitles(['Talent Acquisition', 'Tech Recruiter'])).toEqual([]);
    expect(frenchJobTitles([])).toEqual([]);
  });
});
