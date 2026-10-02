import { describe, it, expect } from 'bun:test';
import { generateFullCVMatchPrompt } from './prompt-templates';
import type { Profile, MasterEntry } from '@/types/profile';

const profile = {
  id: 'p1',
  firstName: 'Jean',
  lastName: 'Test',
} as Profile;

const entries: MasterEntry[] = [
  {
    id: 'e1',
    profileId: 'p1',
    entryType: 'experience',
    title: 'Dev',
    subtitle: 'ACME',
    location: null,
    startDate: '2020',
    endDate: '2023',
    isCurrent: false,
    description: 'Truc',
    metadata: {},
    sortOrder: 0,
    tags: [],
    createdAt: '',
    updatedAt: '',
  },
];

describe('generateFullCVMatchPrompt — clarify mode', () => {
  it('omits the clarification protocol by default', () => {
    const prompt = generateFullCVMatchPrompt(profile, entries, 'Annonce');
    expect(prompt).not.toContain('affinage par questions');
    expect(prompt).toContain('Format de sortie OBLIGATOIRE');
  });

  it('injects the (light) clarification protocol when enabled', () => {
    const prompt = generateFullCVMatchPrompt(profile, entries, 'Annonce', undefined, undefined, true);
    expect(prompt).toContain('affinage par questions');
    expect(prompt).toContain('Maximum **3 questions**');
    // Still ends on the strict JSON output contract.
    expect(prompt).toContain('Format de sortie OBLIGATOIRE');
  });
});

describe('generateFullCVMatchPrompt - C/E : langue et analyse préalable', () => {
  const prompt = generateFullCVMatchPrompt(profile, entries, 'We are hiring a SOC analyst. Fluent English required.');

  it('impose la langue de l\'annonce pour tout le contenu', () => {
    expect(prompt).toContain('langue_annonce');
    expect(prompt).toMatch(/Traduis « Présent »/);
  });

  it('impose une étape d\'analyse rendue dans le JSON avant les entrées', () => {
    expect(prompt).toContain('"analyse"');
    expect(prompt.indexOf('"analyse"')).toBeLessThan(prompt.indexOf('"entries"'));
  });

  it('interdit de renommer ou supprimer la section Compétences', () => {
    expect(prompt).toMatch(/ne supprime, ne renomme et ne fusionne aucune section/i);
  });

  it('ne contient plus de consigne contradictoire « tenir sur une page » sans budget', () => {
    expect(prompt).not.toContain('doit tenir sur une page');
  });
});
