import { describe, it, expect } from 'bun:test';
import { parseSalary, tallyPartners, MAX_PAGES_PER_TITLE } from './france-travail';

describe('parseSalary', () => {
  it('parses plain annual amounts', () => {
    expect(parseSalary({ libelle: 'Annuel de 30000,00 Euros à 35000,00 Euros' }))
      .toMatchObject({ salaryMin: 30000, salaryMax: 35000 });
  });

  it('parses k-suffixed amounts', () => {
    expect(parseSalary({ libelle: '30k€ - 35k€ par an' }))
      .toMatchObject({ salaryMin: 30000, salaryMax: 35000 });
  });

  it('applies the k suffix to the whole range ("35-40k€")', () => {
    expect(parseSalary({ libelle: '35-40k€ selon profil' }))
      .toMatchObject({ salaryMin: 35000, salaryMax: 40000 });
  });

  it('does NOT turn small side amounts into fantasy salaries (500 € prime ≠ 500 k€)', () => {
    const r = parseSalary({ libelle: 'Prime de 500 Euros' });
    expect(r.salaryMin).toBeNull();
    expect(r.salaryMax).toBeNull();
    expect(r.salaryRaw).toBe('Prime de 500 Euros');
  });

  it('ignores out-of-range values', () => {
    expect(parseSalary({ libelle: 'Mensuel de 2500,00 Euros' }).salaryMin).toBeNull();
  });

  it('returns nulls without input', () => {
    expect(parseSalary(undefined).salaryMin).toBeNull();
    expect(parseSalary({}).salaryMin).toBeNull();
  });
});

describe('journal par origine', () => {
  const offers = [
    { id: 'a', origineOffre: { origine: '1' } },
    { id: 'b', origineOffre: { origine: '2', partenaires: [{ nom: 'Talentplug' }] } },
    { id: 'c', origineOffre: { origine: '2', partenaires: [{ nom: 'Talentplug' }, { nom: 'Direct Emploi' }] } },
    { id: 'd', origineOffre: { origine: '2' } },
  ];

  it('classe France Travail, partenaires nommés et partenaire sans nom', () => {
    const t = tallyPartners(offers, new Set(['a', 'c']));
    expect(t['France Travail']).toEqual({ received: 1, retained: 1 });
    expect(t.Talentplug).toEqual({ received: 2, retained: 1 });
    expect(t['Direct Emploi']).toEqual({ received: 1, retained: 1 });
    expect(t['(partenaire sans nom)']).toEqual({ received: 1, retained: 0 });
  });

  it('plafond de 3 pages par intitulé', () => {
    expect(MAX_PAGES_PER_TITLE).toBe(3);
  });
});
