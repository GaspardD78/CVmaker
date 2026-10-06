import { describe, expect, it } from 'bun:test';
import type { OfferAlertLink } from '@/types/job-watch';
import { dedupeById, dedupeOffers, normalizeTitle, offerDedupKey, type DedupableOffer } from './offer-dedup';

const link = (alertId: string, score: number): OfferAlertLink =>
  ({ alertId, score, matchedAt: '2026-10-01' }) as OfferAlertLink;

function offer(id: string, overrides: Partial<DedupableOffer> = {}): DedupableOffer {
  return {
    id, source: 'wttj',
    title: 'Senior Talent Acquisition Specialist (f/h/n)',
    company: 'Hublo', location: 'Paris',
    score: 87, isArchived: 0, kanbanId: null, alerts: [], ...overrides,
  };
}

describe('doublon Hublo — deux causes confirmées par test', () => {
  it('cause 1 : UNE offre liée à deux pistes reste UNE carte, avec ses deux pistes', () => {
    const one = offer('a', { alerts: [link('principale', 87), link('secondaire', 80)] });
    const out = dedupeOffers([one]);
    expect(out).toHaveLength(1);
    expect(out[0].alerts.map(l => l.alertId).sort()).toEqual(['principale', 'secondaire']);
  });

  it('cause 1 bis : une jointure qui répète l\'offre par piste est ramenée à une ligne', () => {
    const rows = [{ id: 'a', alertId: 'principale' }, { id: 'a', alertId: 'secondaire' }];
    expect(dedupeById(rows)).toHaveLength(1);
  });

  it('cause 2 : DEUX enregistrements (urls différentes) deviennent une carte, pistes fusionnées', () => {
    const first = offer('a', { alerts: [link('principale', 87)] });
    const second = offer('b', { alerts: [link('secondaire', 85)], score: 85 });
    const out = dedupeOffers([first, second]);
    expect(out).toHaveLength(1);
    expect(out[0].alerts.map(l => l.alertId).sort()).toEqual(['principale', 'secondaire']);
    expect(out[0].score).toBe(87);
    expect(out[0].duplicateIds).toHaveLength(1);
  });

  it('la mention de genre et la casse ne séparent pas deux annonces', () => {
    expect(normalizeTitle('Recruteur IT (H/F)')).toBe(normalizeTitle('recruteur it'));
    expect(offerDedupKey(offer('a', { title: 'Recruteur (f/h/n)' }))).toBe(offerDedupKey(offer('b', { title: 'RECRUTEUR' })));
  });

  it('« Paris (75) » et « Paris » coïncident ; deux villes restent deux offres', () => {
    expect(dedupeOffers([offer('a', { location: 'Paris (75)' }), offer('b', { location: 'Paris' })])).toHaveLength(1);
    expect(dedupeOffers([offer('a', { location: 'Paris' }), offer('b', { location: 'Lyon' })])).toHaveLength(2);
  });

  it('deux sources différentes ne sont pas fusionnées ici (dédoublonnage inter-sources à la collecte)', () => {
    expect(dedupeOffers([offer('a'), offer('b', { source: 'linkedin' })])).toHaveLength(2);
  });

  it('sans entreprise, rien n\'est regroupé', () => {
    expect(dedupeOffers([offer('a', { company: null }), offer('b', { company: null })])).toHaveLength(2);
  });

  it('le représentant est l\'offre importée au Kanban, sinon la mieux notée', () => {
    const imported = offer('a', { kanbanId: 'k1', score: 60 });
    const better = offer('b', { score: 90 });
    expect(dedupeOffers([better, imported])[0].id).toBe('a');
    expect(dedupeOffers([offer('a', { score: 60 }), better])[0].id).toBe('b');
  });

  it('conserve l\'ordre d\'entrée', () => {
    const out = dedupeOffers([offer('a', { company: 'X' }), offer('b', { company: 'Y' }), offer('c', { company: 'X' })]);
    expect(out.map(o => o.company)).toEqual(['X', 'Y']);
  });
});
