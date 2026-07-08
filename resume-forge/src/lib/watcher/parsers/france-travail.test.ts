import { describe, it, expect } from 'bun:test';
import { parseSalary } from './france-travail';

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
