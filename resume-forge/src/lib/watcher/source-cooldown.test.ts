import { describe, expect, it } from 'bun:test';
import { cooldownUntil, formatCooldownMessage, isCoolingDown } from './source-cooldown';

const NOW = Date.parse('2026-10-05T10:00:00Z');

describe('repos après refus', () => {
  it('APEC bloquée : 24 h de pause', () => {
    const until = cooldownUntil('apec', { kind: 'bloquee', httpStatus: 403, url: null }, NOW);
    expect(until).toBe('2026-10-06T10:00:00.000Z');
  });

  it('pas de pause pour une erreur réseau ni pour une source sans pause', () => {
    expect(cooldownUntil('apec', { kind: 'erreur_reseau', httpStatus: 503, url: null }, NOW)).toBeNull();
    expect(cooldownUntil('wttj', { kind: 'bloquee', httpStatus: 429, url: null }, NOW)).toBeNull();
  });

  it('pas de nouvelle tentative avant 24 h, reprise ensuite', () => {
    const cd = { blockedUntil: '2026-10-06T10:00:00.000Z', reason: null };
    expect(isCoolingDown(cd, NOW + 23 * 3_600_000)).toBe(true);
    expect(isCoolingDown(cd, NOW + 25 * 3_600_000)).toBe(false);
    expect(isCoolingDown(undefined, NOW)).toBe(false);
  });

  it('message lisible', () => {
    expect(formatCooldownMessage('apec', { blockedUntil: '2026-10-06T10:00:00.000Z', reason: null }))
      .toContain('en pause');
  });
});
