import { describe, expect, it } from 'bun:test';
import {
  buildBlacklistSuggestions, suggestTitleTerm, type CompanyOffer, type FeedbackEvent,
} from './blacklist-suggestions';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function offer(id: string, company: string, title: string, o: Partial<CompanyOffer> = {}): CompanyOffer {
  return { id, company, title, isRead: 0, kanbanId: null, fetchedAt: day(3), ...o };
}
const reject = (offerId: string, createdAt = day(2), action = 'quick_archive'): FeedbackEvent => ({ offerId, action, createdAt });

const jobTitles = ['Chargé de recrutement', 'Talent Acquisition'];

/** Trois offres techniques rejetées chez AlgoSecure (poids 2 + 2 + 2 = 6). */
function algosecure() {
  const offers = [
    offer('1', 'AlgoSecure', 'Développeur Python Senior'),
    offer('2', 'AlgoSecure', 'Développeur Rust'),
    offer('3', 'AlgoSecure', 'Ingénieur développeur cloud'),
  ];
  return { offers, feedback: [reject('1'), reject('2'), reject('3')] };
}

const base = { jobTitles, titlesUpdatedAt: null, blacklistedCompanies: [], now: NOW };

describe('suggestions de blacklist', () => {
  it('expose les titres rejetés et leur nombre, plus un terme de poste', () => {
    const { offers, feedback } = algosecure();
    const [s] = buildBlacklistSuggestions({ ...base, offers, feedback });
    expect(s.company).toBe('AlgoSecure');
    expect(s.rejectedCount).toBe(3);
    expect(s.rejectedTitles.map(t => t.title)).toContain('Développeur Rust');
    expect(s.suggestedTerm).toBe('développeur');
  });

  it('pas de suggestion sous le seuil de rejets', () => {
    const { offers, feedback } = algosecure();
    expect(buildBlacklistSuggestions({ ...base, offers, feedback: feedback.slice(0, 2) })).toEqual([]);
  });

  it('pas de suggestion si une offre de l\'entreprise a été importée, aimée ou ouverte', () => {
    const { offers, feedback } = algosecure();
    const imported = [...offers, offer('4', 'AlgoSecure', 'Responsable RH', { kanbanId: 'k1' })];
    expect(buildBlacklistSuggestions({ ...base, offers: imported, feedback })).toEqual([]);

    const liked = [...offers, offer('5', 'AlgoSecure', 'Office manager')];
    expect(buildBlacklistSuggestions({
      ...base, offers: liked, feedback: [...feedback, { offerId: '5', action: 'thumbs_up', createdAt: day(1) }],
    })).toEqual([]);

    const opened = [...offers, offer('6', 'AlgoSecure', 'Office manager', { isRead: 1 })];
    expect(buildBlacklistSuggestions({ ...base, offers: opened, feedback })).toEqual([]);
  });

  it('une offre ouverte PUIS rejetée ne protège pas l\'entreprise', () => {
    const { offers, feedback } = algosecure();
    const readThenRejected = offers.map(o => ({ ...o, isRead: 1 }));
    expect(buildBlacklistSuggestions({ ...base, offers: readThenRejected, feedback })).toHaveLength(1);
  });

  it('pas de suggestion si une offre récente correspond aux intitulés visés', () => {
    const { offers, feedback } = algosecure();
    const hiring = [...offers, offer('7', 'AlgoSecure', 'Chargé de recrutement IT', { fetchedAt: day(5) })];
    expect(buildBlacklistSuggestions({ ...base, offers: hiring, feedback })).toEqual([]);
    // Trop ancienne : ne protège plus.
    const stale = [...offers, offer('8', 'AlgoSecure', 'Chargé de recrutement IT', { fetchedAt: day(60) })];
    expect(buildBlacklistSuggestions({ ...base, offers: stale, feedback })).toHaveLength(1);
  });

  it('ignore les rejets antérieurs à la dernière modification des intitulés', () => {
    const { offers } = algosecure();
    const feedback = [reject('1', day(20)), reject('2', day(20)), reject('3', day(20))];
    expect(buildBlacklistSuggestions({ ...base, offers, feedback, titlesUpdatedAt: day(10) })).toEqual([]);
    expect(buildBlacklistSuggestions({ ...base, offers, feedback, titlesUpdatedAt: day(30) })).toHaveLength(1);
  });

  it('ne re-suggère pas une entreprise déjà blacklistée (casse ignorée)', () => {
    const { offers, feedback } = algosecure();
    expect(buildBlacklistSuggestions({ ...base, offers, feedback, blacklistedCompanies: ['ALGOSECURE'] })).toEqual([]);
  });
});

describe('suggestTitleTerm', () => {
  it('le mot le plus partagé par les titres rejetés', () => {
    expect(suggestTitleTerm([
      { title: 'Développeur Go', count: 1 }, { title: 'Développeur Java', count: 1 },
    ])).toBe('développeur');
  });

  it('aucun titre : null', () => {
    expect(suggestTitleTerm([])).toBeNull();
  });
});
