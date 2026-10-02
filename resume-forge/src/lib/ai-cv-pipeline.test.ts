import { describe, it, expect } from 'bun:test';
import { analyzeAiCvJson } from './ai-cv-pipeline';
import { TEST_PROFILE, makeEntries } from './test-helpers/cv-fixtures';

const ctx = { entries: makeEntries(), profile: TEST_PROFILE, now: new Date(Date.UTC(2026, 5, 15)) };

describe('analyzeAiCvJson', () => {
  it('parse puis nettoie : texte parasite, puces « • », ID inconnu', () => {
    const raw = 'Voici :\n```json\n{"entries":[{"id":"x1","description":"• Supervision de 12 sources de logs."},{"id":"nope"}]}\n```';
    const r = analyzeAiCvJson(raw, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.entries).toEqual([{ id: 'x1', visible: true, description: '- Supervision de 12 sources de logs' }]);
    expect(r.report.warnings.some(w => w.code === 'unknown-id')).toBe(true);
  });

  it('JSON illisible : erreur, pas d\'exception', () => {
    const r = analyzeAiCvJson('rien', ctx);
    expect(r.ok).toBe(false);
  });

  it('ancien schéma : accepté sans erreur bloquante', () => {
    const r = analyzeAiCvJson('{"title":"Analyste SOC","summary":"Accroche","entries":[{"id":"x1","visible":true,"description":"- Supervision de 12 sources"}]}', ctx);
    expect(r.ok && r.report.errors.length).toBe(0);
  });

  it('nombre inventé : erreur bloquante remontée', () => {
    const r = analyzeAiCvJson('{"entries":[{"id":"x1","description":"- Gain de 99 % de temps"}]}', ctx);
    expect(r.ok && r.report.errors.length).toBe(1);
  });
});
