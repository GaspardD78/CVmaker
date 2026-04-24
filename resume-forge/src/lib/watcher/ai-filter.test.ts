/**
 * Tests for the AI filter layer — schema validation, pattern matching,
 * hard exclusions and bounded soft adjustments.
 */

import { describe, expect, test } from 'bun:test';
import {
  AI_FILTER_SCHEMA_VERSION,
  applyAIFilter,
  buildAIFilterPrompt,
  validateAIFilterRule,
  type AIFilterRule,
} from './ai-filter';

const baseOffer = {
  title: 'Senior React Developer',
  company: 'Acme Corp',
  descriptionSnippet: 'Work on a modern TypeScript stack in remote-first environment',
  location: 'Paris',
};

describe('validateAIFilterRule', () => {
  test('rejects non-object input', () => {
    expect(() => validateAIFilterRule(null)).toThrow();
    expect(() => validateAIFilterRule('string')).toThrow();
    expect(() => validateAIFilterRule(42)).toThrow();
  });

  test('rejects wrong schema version', () => {
    expect(() => validateAIFilterRule({ version: '0.9', name: 'x' })).toThrow(/Version/);
  });

  test('requires a non-empty name', () => {
    expect(() => validateAIFilterRule({ version: AI_FILTER_SCHEMA_VERSION })).toThrow(/name/);
    expect(() => validateAIFilterRule({ version: AI_FILTER_SCHEMA_VERSION, name: '   ' })).toThrow();
  });

  test('accepts a minimal rule and fills createdAt', () => {
    const rule = validateAIFilterRule({ version: AI_FILTER_SCHEMA_VERSION, name: 'My Rule' });
    expect(rule.name).toBe('My Rule');
    expect(typeof rule.createdAt).toBe('string');
  });

  test('enforces array typing on excludeIf*', () => {
    expect(() => validateAIFilterRule({
      version: AI_FILTER_SCHEMA_VERSION, name: 'x', excludeIfTitle: 'not an array',
    })).toThrow(/excludeIfTitle/);
    expect(() => validateAIFilterRule({
      version: AI_FILTER_SCHEMA_VERSION, name: 'x', excludeIfTitle: [42],
    })).toThrow();
  });

  test('enforces weighted pattern shape', () => {
    expect(() => validateAIFilterRule({
      version: AI_FILTER_SCHEMA_VERSION, name: 'x',
      boostIfTitleContains: [{ pattern: 'senior' }],
    })).toThrow(/weight/);
    expect(() => validateAIFilterRule({
      version: AI_FILTER_SCHEMA_VERSION, name: 'x',
      boostIfTitleContains: [{ pattern: '', weight: 10 }],
    })).toThrow(/pattern/);
  });

  test('accepts a full-featured rule', () => {
    const rule = validateAIFilterRule({
      version: AI_FILTER_SCHEMA_VERSION,
      name: 'Full rule',
      excludeIfTitle: ['stage'],
      boostIfTitleContains: [{ pattern: 'senior', weight: 10, reason: 'senior' }],
      penalizeIfDescriptionContains: [{ pattern: 'sur site', weight: 5 }],
      maxBoost: 15,
      maxPenalty: 10,
    });
    expect(rule.excludeIfTitle).toEqual(['stage']);
    expect(rule.boostIfTitleContains?.[0].weight).toBe(10);
    expect(rule.maxBoost).toBe(15);
  });
});

describe('applyAIFilter', () => {
  const rule: AIFilterRule = {
    version: AI_FILTER_SCHEMA_VERSION,
    name: 'Test rule',
    excludeIfTitle: ['stage', 'alternance'],
    excludeIfCompany: ['BNP'],
    boostIfTitleContains: [
      { pattern: 'senior', weight: 10 },
      { pattern: '/lead|principal/i', weight: 8 },
    ],
    penalizeIfDescriptionContains: [
      { pattern: 'sur site', weight: 5 },
    ],
    maxBoost: 15,
    maxPenalty: 10,
  };

  test('returns empty result when no rule provided', () => {
    const r = applyAIFilter(null, baseOffer);
    expect(r.disqualified).toBe(false);
    expect(r.delta).toBe(0);
    expect(r.matches).toEqual([]);
  });

  test('excludes by title substring', () => {
    const r = applyAIFilter(rule, { ...baseOffer, title: 'Développeur en alternance' });
    expect(r.disqualified).toBe(true);
    expect(r.disqualifyReason).toContain('alternance');
  });

  test('excludes by company regardless of case', () => {
    const r = applyAIFilter(rule, { ...baseOffer, company: 'bnp paribas' });
    expect(r.disqualified).toBe(true);
  });

  test('applies boost when title matches substring', () => {
    const r = applyAIFilter(rule, baseOffer);
    expect(r.disqualified).toBe(false);
    expect(r.delta).toBe(10);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].weight).toBe(10);
  });

  test('applies boost when title matches regex pattern', () => {
    const r = applyAIFilter(rule, { ...baseOffer, title: 'Tech Lead' });
    // "Tech Lead" matches /lead|principal/i but not "senior"
    expect(r.delta).toBe(8);
  });

  test('stacks multiple boosts but respects maxBoost cap', () => {
    const ruleMany: AIFilterRule = {
      ...rule,
      boostIfTitleContains: [
        { pattern: 'senior', weight: 10 },
        { pattern: 'react', weight: 10 },
        { pattern: 'developer', weight: 10 },
      ],
      maxBoost: 15,
    };
    const r = applyAIFilter(ruleMany, baseOffer);
    expect(r.delta).toBe(15);
  });

  test('applies penalty with correct sign', () => {
    const r = applyAIFilter(rule, {
      ...baseOffer,
      title: 'Developer',
      descriptionSnippet: 'Poste en présentiel sur site',
    });
    expect(r.delta).toBe(-5);
  });

  test('respects maxPenalty cap', () => {
    const ruleMany: AIFilterRule = {
      ...rule,
      penalizeIfDescriptionContains: [
        { pattern: 'sur site', weight: 8 },
        { pattern: 'présentiel', weight: 8 },
      ],
      maxPenalty: 10,
    };
    const r = applyAIFilter(ruleMany, {
      ...baseOffer,
      title: 'Developer',
      descriptionSnippet: 'Sur site, présentiel uniquement',
    });
    expect(r.delta).toBe(-10);
  });

  test('boost and penalty combine', () => {
    const r = applyAIFilter(rule, {
      ...baseOffer,
      title: 'Senior Developer',
      descriptionSnippet: 'Poste sur site uniquement',
    });
    expect(r.delta).toBe(10 - 5);
  });

  test('malformed regex falls back to substring matching', () => {
    // Pattern is wrapped as /…/ so the compiler tries `new RegExp('[bad')`,
    // which throws. Fallback searches for the verbatim pattern string.
    const r = applyAIFilter(
      {
        ...rule,
        boostIfTitleContains: [{ pattern: '/[bad/', weight: 5 }],
      },
      { ...baseOffer, title: 'Role mentions /[bad/ literally' },
    );
    expect(r.delta).toBe(5);
  });
});

describe('buildAIFilterPrompt', () => {
  test('includes the user intent', () => {
    const prompt = buildAIFilterPrompt('Senior dev React remote');
    expect(prompt).toContain('Senior dev React remote');
    expect(prompt).toContain(AI_FILTER_SCHEMA_VERSION);
    expect(prompt).toContain('AIFilterRule');
  });

  test('trims the intent', () => {
    const prompt = buildAIFilterPrompt('   padded   ');
    expect(prompt).toContain('padded');
    expect(prompt).not.toContain('   padded   ');
  });
});
