/**
 * Analyse du seuil de score minimum (spec 006, phase 8).
 *
 * « 79 % des offres filtrées » n'a de sens que si les scores comparés au seuil
 * sont de la même échelle : seules les offres à la version courante du scorer
 * entrent ici. Le module répond à trois questions : quelles offres le seuil
 * masque-t-il, quel seuil aurait gardé les offres que l'utilisateur a
 * importées ou aimées récemment, et combien d'offres seraient alors visibles.
 */

import { SCORER_VERSION } from './scorer';

export interface ThresholdOffer {
  id: string;
  title: string;
  company: string | null;
  score: number;
  scoreVersion?: number;
  fetchedAt: string;
  kanbanId: string | null;
  isArchived: number;
}

/** Fenêtre d'observation des offres appréciées. */
export const APPRECIATION_WINDOW_DAYS = 30;

export const isCurrentScore = (o: Pick<ThresholdOffer, 'scoreVersion'>): boolean =>
  (o.scoreVersion ?? 1) >= SCORER_VERSION;

/** Offres masquées par le seuil, les mieux notées d'abord (score de la version courante seulement). */
export function hiddenByThreshold<T extends ThresholdOffer>(offers: T[], minScore: number): T[] {
  return offers
    .filter(o => o.isArchived === 0 && isCurrentScore(o) && o.score < minScore)
    .sort((a, b) => b.score - a.score);
}

export function visibleCount(offers: ThresholdOffer[], minScore: number): number {
  return offers.filter(o => o.isArchived === 0 && (!isCurrentScore(o) || o.score >= minScore)).length;
}

export interface ThresholdSuggestion {
  /** Seuil qui garde toutes les offres appréciées de la fenêtre. */
  threshold: number;
  /** Offres appréciées (importées ou aimées) prises en compte. */
  appreciated: number;
  /** Offres visibles avec le seuil actuel. */
  visibleNow: number;
  /** Offres visibles avec le seuil suggéré. */
  visibleAfter: number;
}

/**
 * Seuil suggéré : le score de l'offre appréciée la moins bien notée parmi
 * celles des 30 derniers jours (importées au Kanban ou aimées). Null quand
 * aucune offre appréciée à score courant ne permet de conclure.
 */
export function suggestThreshold(
  offers: ThresholdOffer[],
  likedIds: ReadonlySet<string>,
  currentMin: number,
  now: number = Date.now(),
): ThresholdSuggestion | null {
  const since = now - APPRECIATION_WINDOW_DAYS * 86_400_000;
  const appreciated = offers.filter(o =>
    isCurrentScore(o)
    && (o.kanbanId !== null || likedIds.has(o.id))
    && new Date(o.fetchedAt.includes('T') ? o.fetchedAt : `${o.fetchedAt.replace(' ', 'T')}Z`).getTime() >= since,
  );
  if (appreciated.length === 0) return null;

  const threshold = Math.floor(Math.min(...appreciated.map(o => o.score)));
  return {
    threshold,
    appreciated: appreciated.length,
    visibleNow: visibleCount(offers, currentMin),
    visibleAfter: visibleCount(offers, threshold),
  };
}
