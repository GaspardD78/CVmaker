/**
 * Suggestions de blacklist d'entreprises (spec 006, phase 9).
 *
 * Rejeter trois offres techniques chez une société de cybersécurité ne veut pas
 * dire rejeter la société : un poste de Talent Acquisition chez elle serait
 * parfaitement pertinent. Une suggestion n'est donc émise que si les rejets sont
 * récents (depuis la dernière modification des intitulés de la piste) et que
 * l'entreprise n'a rien d'apprécié ni de ciblé ; elle expose les titres rejetés
 * et propose deux portées : l'entreprise entière, ou ce type de poste chez elle.
 */

import { extractSignificantTerms } from './learning-engine';
import { titleMatchesAnyJobTitle } from './parsers/apec';

export interface FeedbackEvent {
  offerId: string;
  action: string;
  createdAt: string;
}

export interface CompanyOffer {
  id: string;
  title: string;
  company: string | null;
  isRead: number;
  kanbanId: string | null;
  fetchedAt: string;
}

export interface RejectedTitle {
  title: string;
  count: number;
}

export interface BlacklistSuggestion {
  /** Nom tel qu'affiché (première graphie rencontrée). */
  company: string;
  /** Clé de comparaison : minuscules, espaces normalisés. */
  key: string;
  rejectedTitles: RejectedTitle[];
  rejectedCount: number;
  /** Terme de titre proposé pour « ignorer ce type de poste chez elle ». */
  suggestedTerm: string | null;
}

export interface SuggestionInput {
  offers: CompanyOffer[];
  feedback: FeedbackEvent[];
  /** Intitulés visés de la piste. */
  jobTitles: string[];
  /** Dernière modification des intitulés : les rejets antérieurs sont ignorés. */
  titlesUpdatedAt: string | null;
  blacklistedCompanies: string[];
  now?: number;
  /** Poids cumulé de rejets à atteindre (thumbs_down = 1, quick_archive = 2). */
  threshold?: number;
}

/** Poids cumulé à partir duquel une entreprise est suggérée (inchangé depuis la réputation entreprise). */
export const REJECTION_THRESHOLD = 5;
/** Une offre est « récente » pour le critère des intitulés visés sous ce délai. */
export const RECENT_TARGET_DAYS = 30;

const REJECT_WEIGHT: Record<string, number> = { thumbs_down: 1, quick_archive: 2 };
const APPRECIATED_ACTIONS = new Set(['thumbs_up', 'kanban_import']);

export const companyKey = (company: string): string => company.trim().toLowerCase().replace(/\s+/g, ' ');

/** Date SQLite (`YYYY-MM-DD HH:MM:SS`) ou ISO → timestamp ms. */
function toMs(date: string): number {
  return new Date(date.includes('T') ? date : `${date.replace(' ', 'T')}Z`).getTime();
}

/**
 * Terme de titre à ignorer chez une entreprise : le mot significatif le plus
 * fréquent parmi les titres rejetés (au moins 2 titres le partagent), à défaut
 * le premier mot significatif du titre rejeté.
 */
export function suggestTitleTerm(rejectedTitles: RejectedTitle[]): string | null {
  if (rejectedTitles.length === 0) return null;
  const freq = new Map<string, number>();
  for (const { title, count } of rejectedTitles) {
    for (const term of new Set(extractSignificantTerms(title))) {
      freq.set(term, (freq.get(term) ?? 0) + count);
    }
  }
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  if (ranked.length === 0) return null;
  return ranked[0][0];
}

export function buildBlacklistSuggestions(input: SuggestionInput): BlacklistSuggestion[] {
  const now = input.now ?? Date.now();
  const threshold = input.threshold ?? REJECTION_THRESHOLD;
  const sinceTitles = input.titlesUpdatedAt ? toMs(input.titlesUpdatedAt) : -Infinity;
  const recentSince = now - RECENT_TARGET_DAYS * 86_400_000;
  const blacklisted = new Set(input.blacklistedCompanies.map(companyKey));

  const offerById = new Map(input.offers.map(o => [o.id, o]));
  const offersByCompany = new Map<string, CompanyOffer[]>();
  for (const offer of input.offers) {
    if (!offer.company?.trim()) continue;
    const key = companyKey(offer.company);
    const list = offersByCompany.get(key) ?? [];
    list.push(offer);
    offersByCompany.set(key, list);
  }

  // Offres rejetées (à tout moment) et offres appréciées, par identifiant.
  const rejectedIds = new Set<string>();
  const appreciatedIds = new Set<string>();
  for (const event of input.feedback) {
    if (event.action in REJECT_WEIGHT) rejectedIds.add(event.offerId);
    if (APPRECIATED_ACTIONS.has(event.action)) appreciatedIds.add(event.offerId);
  }

  // Poids de rejet par entreprise, sur les seuls rejets postérieurs à la modification des intitulés.
  const weight = new Map<string, number>();
  const titles = new Map<string, Map<string, RejectedTitle>>();
  const display = new Map<string, string>();
  for (const event of input.feedback) {
    const w = REJECT_WEIGHT[event.action];
    if (!w || toMs(event.createdAt) <= sinceTitles) continue;
    const offer = offerById.get(event.offerId);
    if (!offer?.company?.trim()) continue;
    const key = companyKey(offer.company);
    weight.set(key, (weight.get(key) ?? 0) + w);
    if (!display.has(key)) display.set(key, offer.company.trim());
    const byTitle = titles.get(key) ?? new Map<string, RejectedTitle>();
    const tKey = offer.title.trim().toLowerCase();
    const entry = byTitle.get(tKey) ?? { title: offer.title.trim(), count: 0 };
    entry.count += 1;
    byTitle.set(tKey, entry);
    titles.set(key, byTitle);
  }

  const suggestions: BlacklistSuggestion[] = [];
  for (const [key, total] of weight) {
    if (total < threshold || blacklisted.has(key)) continue;

    const companyOffers = offersByCompany.get(key) ?? [];

    // Une offre ouverte (et non rejetée), aimée ou importée : l'entreprise intéresse.
    const appreciated = companyOffers.some(o =>
      o.kanbanId !== null
      || appreciatedIds.has(o.id)
      || (o.isRead === 1 && !rejectedIds.has(o.id)),
    );
    if (appreciated) continue;

    // Une offre récente, non rejetée, qui correspond aux intitulés visés : elle recrute pour la cible.
    const hasTargeted = input.jobTitles.length > 0 && companyOffers.some(o =>
      toMs(o.fetchedAt) >= recentSince
      && !rejectedIds.has(o.id)
      && titleMatchesAnyJobTitle(o.title, input.jobTitles),
    );
    if (hasTargeted) continue;

    const rejectedTitles = [...(titles.get(key)?.values() ?? [])].sort((a, b) => b.count - a.count);
    suggestions.push({
      company: display.get(key) ?? key,
      key,
      rejectedTitles,
      rejectedCount: rejectedTitles.reduce((n, t) => n + t.count, 0),
      suggestedTerm: suggestTitleTerm(rejectedTitles),
    });
  }

  return suggestions.sort((a, b) => b.rejectedCount - a.rejectedCount);
}
