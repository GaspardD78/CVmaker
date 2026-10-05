/**
 * Pistes quasi identiques (spec 006, phase 6).
 *
 * Deux pistes aux mêmes intitulés interrogent les mêmes sources avec les mêmes
 * mots-clés : elles ramènent les mêmes offres, qui s'affichent deux fois et
 * faussent les comparaisons entre pistes. On les signale ; la fusion reste à
 * l'utilisateur.
 */

import type { JobWatchAlert } from '@/types/job-watch';

function norm(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Similarité de Jaccard entre deux listes d'intitulés (0 à 1) ; 0 si l'une est vide. */
export function titleSimilarity(a: string[], b: string[]): number {
  const sa = new Set(a.map(norm).filter(Boolean));
  const sb = new Set(b.map(norm).filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared++;
  return shared / (sa.size + sb.size - shared);
}

export interface NearDuplicateAlert {
  /** La piste regardée. */
  alertId: string;
  /** La piste dont elle est quasi identique. */
  otherId: string;
  otherName: string;
  similarity: number;
}

/** Seuil à partir duquel deux pistes sont jugées quasi identiques. */
export const NEAR_DUPLICATE_THRESHOLD = 0.8;

/**
 * Pour une piste, la piste du portefeuille la plus proche si elle est quasi
 * identique (similarité des intitulés ≥ seuil), sinon null.
 */
export function findNearDuplicateAlert(
  alert: JobWatchAlert,
  alerts: JobWatchAlert[],
  threshold: number = NEAR_DUPLICATE_THRESHOLD,
): NearDuplicateAlert | null {
  let best: NearDuplicateAlert | null = null;
  for (const other of alerts) {
    if (other.id === alert.id || other.enabled !== 1) continue;
    const similarity = titleSimilarity(alert.searchProfile.jobTitles, other.searchProfile.jobTitles);
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { alertId: alert.id, otherId: other.id, otherName: other.name, similarity };
    }
  }
  return best;
}
