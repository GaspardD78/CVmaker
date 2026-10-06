/**
 * Couverture d'Emploi Territorial via « Choisir le service public » (spec 007, phase 2).
 *
 * Le flux RSS d'Emploi Territorial reste fermé. Ses offres arrivent par
 * « Choisir le service public », qui les relaie avec leur origine. Ce module
 * compte, pour l'affichage du tableau des collectes, les offres d'origine
 * territoriale reçues lors de la dernière collecte de cette source.
 */

import type { JobOffer } from '@/types/job-watch';

/** Une collecte dure quelques minutes (une requête par seconde) : fenêtre large avant l'heure du journal. */
const COLLECT_WINDOW_MS = 45 * 60_000;
/** Marge après l'heure du journal (horloges SQLite / JS). */
const AFTER_MARGIN_MS = 2 * 60_000;

/** Horodatage SQLite (`YYYY-MM-DD HH:MM:SS`, UTC) ou ISO → millisecondes. */
export function toMillis(stamp: string): number {
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stamp) ? `${stamp.replace(' ', 'T')}Z` : stamp;
  return new Date(iso).getTime();
}

/** Offres d'origine Emploi Territorial reçues lors de la collecte consignée à `lastLogAt`. */
export function countTerritorialOffers(
  offers: ReadonlyArray<Pick<JobOffer, 'source' | 'origin' | 'fetchedAt'>>,
  lastLogAt: string | null,
): number {
  if (!lastLogAt) return 0;
  const end = toMillis(lastLogAt);
  if (Number.isNaN(end)) return 0;
  return offers.filter(o => {
    if (o.source !== 'choisir_service_public' || o.origin !== 'emploi_territorial') return false;
    const t = toMillis(o.fetchedAt);
    return t >= end - COLLECT_WINDOW_MS && t <= end + AFTER_MARGIN_MS;
  }).length;
}

/** Texte de la ligne « Emploi Territorial » du tableau des collectes. */
export function territorialCoverageText(
  viaConfigured: boolean,
  lastLogAt: string | null,
  count: number,
): { headline: string; detail: string } {
  const headline = 'Couvert via Choisir le service public';
  if (!viaConfigured) {
    return { headline, detail: 'Ajoutez « Choisir le service public » à la piste pour recevoir ces offres.' };
  }
  if (!lastLogAt) return { headline, detail: 'Aucune collecte encore.' };
  return {
    headline,
    detail: count === 0
      ? 'Aucune offre d\'origine territoriale à la dernière collecte.'
      : `${count} offre${count > 1 ? 's' : ''} d'origine territoriale à la dernière collecte.`,
  };
}
