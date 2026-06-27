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
