import { describe, expect, it } from 'bun:test';
import { displayTitle, entryDisplayTitle } from './entry-display';

describe('displayTitle', () => {
  const cases: [string, string | null, string][] = [
    ['Analyste SOC (Acme)', 'Acme', 'Analyste SOC'],
    ['Analyste SOC (Globex / Initech)', 'Globex / Initech', 'Analyste SOC'],
    ['Développeur web (ABC)', 'ABC', 'Développeur web'],
    ['Alternance Master 1, Consultant junior (Umbrella conseil)', 'Umbrella conseil', 'Alternance Master 1, Consultant junior'],
    ['Responsable sécurité', 'Initech', 'Responsable sécurité'],
    ['Master 2 - Informatique', 'Université fictive', 'Master 2 - Informatique'],
    ['Mission (Phase 2)', 'Initech', 'Mission (Phase 2)'],
  ];
  for (const [title, subtitle, expected] of cases) {
    it(`« ${title} » / « ${subtitle} » → « ${expected} »`, () => {
      expect(displayTitle(title, subtitle)).toBe(expected);
    });
  }

  it('comparaison sans casse ni accents, inclusion dans les deux sens', () => {
    expect(displayTitle('Analyste (ÉCOLE Fictive)', 'ecole fictive')).toBe('Analyste');
    expect(displayTitle('Analyste (Acme)', 'Acme Paris')).toBe('Analyste');
    expect(displayTitle('Analyste (Acme Paris)', 'Acme')).toBe('Analyste');
  });

  it('sans sous-titre : titre inchangé', () => {
    expect(displayTitle('Analyste (Acme)', null)).toBe('Analyste (Acme)');
    expect(displayTitle('Analyste (Acme)', '  ')).toBe('Analyste (Acme)');
  });
});

describe('entryDisplayTitle', () => {
  const entry = { title: 'Analyste SOC (Acme)', subtitle: 'Acme' };

  it('sans surcharge : titre propre', () => {
    expect(entryDisplayTitle(entry, {})).toBe('Analyste SOC');
  });

  it('une surcharge de titre est prioritaire et affichée telle quelle', () => {
    expect(entryDisplayTitle(entry, { title: 'SOC Analyst (Acme)' })).toBe('SOC Analyst (Acme)');
  });

  it('utilise le sous-titre surchargé', () => {
    expect(entryDisplayTitle(entry, { subtitle: 'Autre' })).toBe('Analyste SOC (Acme)');
  });
});
