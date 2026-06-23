/**
 * Nettoyage des offres périmées.
 *
 * Une offre est considérée « périmée » lorsqu'elle est plus ancienne qu'un seuil
 * (par défaut 30 jours). L'âge est mesuré depuis `publishedAt` quand cette date
 * est exploitable, sinon depuis `fetchedAt` (toujours un timestamp valide produit
 * par SQLite). Ce module ne contient que la logique de décision (pure et testable) ;
 * la suppression réelle est faite en SQL dans `jobWatchStore.purgeExpiredOffers`,
 * dont l'expression `julianday('now') - COALESCE(julianday(published_at), julianday(fetched_at))`
 * reflète exactement `offerAgeDays` ci-dessous.
 */

import type { JobOffer } from '@/types/job-watch';
import { DEFAULT_EXPIRED_MAX_AGE_DAYS } from '@/types/job-watch';

export { DEFAULT_EXPIRED_MAX_AGE_DAYS };

const MS_PER_DAY = 86_400_000;

/**
 * Convertit une date en millisecondes epoch, ou `null` si elle est absente /
 * illisible. Les timestamps SQLite « YYYY-MM-DD HH:MM:SS » (UTC, sans fuseau)
 * sont normalisés en ISO-8601 UTC pour éviter une interprétation en heure locale.
 */
function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  let s = value.trim();
  const sqlite = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(s);
  if (sqlite) s = `${sqlite[1]}T${sqlite[2]}Z`;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Âge de l'offre en jours (depuis `publishedAt`, sinon `fetchedAt`).
 * Renvoie `null` si aucune des deux dates n'est exploitable.
 */
export function offerAgeDays(
  offer: Pick<JobOffer, 'publishedAt' | 'fetchedAt'>,
  now: Date = new Date(),
): number | null {
  const ref = parseTimestamp(offer.publishedAt) ?? parseTimestamp(offer.fetchedAt);
  if (ref === null) return null;
  return (now.getTime() - ref) / MS_PER_DAY;
}

/**
 * `true` lorsque l'offre est strictement plus ancienne que `maxAgeDays`.
 * Une offre dont aucune date n'est exploitable n'est jamais considérée périmée
 * (on préfère conserver une offre douteuse plutôt que de la supprimer à tort).
 */
export function isOfferExpired(
  offer: Pick<JobOffer, 'publishedAt' | 'fetchedAt'>,
  maxAgeDays: number,
  now: Date = new Date(),
): boolean {
  const age = offerAgeDays(offer, now);
  return age !== null && age > maxAgeDays;
}
