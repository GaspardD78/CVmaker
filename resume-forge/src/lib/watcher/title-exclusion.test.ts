import { describe, expect, it } from 'bun:test';
import { DEFAULT_SEARCH_PROFILE } from '@/types/job-watch';
import { computeScore } from './scorer';
import { isTitleExcluded } from './title-exclusion';

const exclusions = [{ company: 'AlgoSecure', term: 'développeur' }];

describe('« Ignorer ce type de poste chez elle »', () => {
  it('exclut le terme de titre pour cette entreprise seulement', () => {
    expect(isTitleExcluded('Développeur Rust', 'algosecure', exclusions)).toBe(true);
    expect(isTitleExcluded('Developpeur Rust', 'AlgoSecure', exclusions)).toBe(true); // accents ignorés
    expect(isTitleExcluded('Développeur Rust', 'Autre société', exclusions)).toBe(false);
  });

  it('portée titre uniquement : un poste de Talent Acquisition chez elle reste visible', () => {
    expect(isTitleExcluded('Talent Acquisition Specialist', 'AlgoSecure', exclusions)).toBe(false);
  });

  it('mot entier : « développeurs » ne correspond pas à un terme plus court', () => {
    expect(isTitleExcluded('Responsable du développement RH', 'AlgoSecure', exclusions)).toBe(false);
  });

  it('le scorer écarte (score 0) le type de poste exclu, pas l\'entreprise', () => {
    const profile = {
      ...DEFAULT_SEARCH_PROFILE,
      jobTitles: ['Talent Acquisition'],
      contractTypes: [],
      companyTitleExclusions: exclusions,
    };
    const extraction = {
      titleSource: 'api', titleConfidence: 'high', locationSource: 'none',
      locationConfidence: 'none', contractSource: 'none', contractConfidence: 'none',
    } as const;
    const offer = (title: string) => ({
      title, company: 'AlgoSecure', descriptionSnippet: '', publishedAt: null,
      salaryMin: null, salaryMax: null, contractType: null, extraction,
    });
    expect(computeScore(offer('Développeur Rust'), profile)).toBe(0);
    expect(computeScore(offer('Talent Acquisition Manager'), profile)).toBeGreaterThan(0);
  });
});
