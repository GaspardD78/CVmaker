import { describe, expect, it } from 'bun:test';
import {
  buildApecQuery, buildEmploiTerritorialQuery, buildFranceTravailQuery, summarizeSourceQuery,
} from './profile-to-query';
import { DEFAULT_SEARCH_PROFILE, type SearchProfile } from '@/types/job-watch';

const profile = (jobTitles: string[]): SearchProfile => ({
  ...DEFAULT_SEARCH_PROFILE,
  jobTitles,
  location: { ...DEFAULT_SEARCH_PROFILE.location, departmentCodes: ['78'], city: 'Versailles' },
});

const MIXED = ['"Talent Acquisition"', 'Tech Recruiter', 'Chargé de recrutement IT', 'Recruteur'].map(t => t.replace(/"/g, ''));

describe('requêtes France Travail et Emploi Territorial : intitulés français', () => {
  it('France Travail n\'envoie que les intitulés français', () => {
    const q = buildFranceTravailQuery(profile(MIXED));
    expect(q.titles).toEqual(['Chargé de recrutement IT', 'Recruteur']);
  });

  it('Emploi Territorial : expression q sans intitulé anglais', () => {
    const q = buildEmploiTerritorialQuery(profile(MIXED));
    expect(q.q).toBe('"Chargé de recrutement IT" or "Recruteur"');
    expect(q.q).not.toContain('Talent');
    expect(q.lieu).toBe('78');
  });

  it('un seul intitulé français : phrase exacte sans « or »', () => {
    expect(buildEmploiTerritorialQuery(profile(['Recruteur'])).q).toBe('"Recruteur"');
  });

  it('aucun intitulé français : pas de requête, message d\'aide', () => {
    const p = profile(['Talent Acquisition', 'Tech Recruiter']);
    expect(buildFranceTravailQuery(p).titles).toEqual([]);
    expect(buildEmploiTerritorialQuery(p).q).toBeUndefined();
    expect(summarizeSourceQuery('france_travail', p)).toContain('Ajoutez un intitulé français');
    expect(summarizeSourceQuery('emploi_territorial', p)).toContain('Ajoutez un intitulé français');
  });

  it('APEC garde tous les intitulés (l\'index accepte les deux langues)', () => {
    const q = buildApecQuery(profile(['Talent Acquisition', 'Recruteur']));
    expect(q.motsCles).toBe('("Talent Acquisition" OU Recruteur)');
  });
});
