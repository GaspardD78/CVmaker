/**
 * Doublons d'offres à l'affichage et au diagnostic (spec 006, phase 6).
 *
 * Deux causes distinctes produisent « la même offre deux fois » :
 *
 *  1. UNE offre rattachée à deux pistes (`job_offer_alerts`) : ce n'est pas un
 *     doublon, c'est une carte avec deux pistes. Les listes consomment des
 *     offres déjà enrichies de leurs liens, donc cette cause ne duplique rien ;
 *     en revanche les requêtes qui joignent les liens ou les retours
 *     (JOIN / LEFT JOIN) répètent l'offre une fois par ligne : voir
 *     `dedupeById`.
 *  2. DEUX enregistrements (hash différents) pour une même annonce : une source
 *     republie l'annonce sous une autre adresse (autre slug, autre paramètre).
 *     Le hash `source + url` ne les rapproche pas, et le dédoublonnage
 *     inter-sources ignore les paires de même source. On les regroupe par
 *     source + entreprise + intitulé + lieu normalisés.
 *
 * Le regroupement est non destructif : rien n'est supprimé en base.
 */

import type { OfferAlertLink } from '@/types/job-watch';

export interface DedupableOffer {
  id: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  score: number;
  isArchived: number;
  kanbanId: string | null;
  alerts: OfferAlertLink[];
  /** Dates facultatives : à égalité de statut, la republication la plus récente représente le groupe. */
  publishedAt?: string | null;
  fetchedAt?: string | null;
}

function strip(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Intitulé sans mention de genre « (f/h/n) », « (H/F) », ponctuation et casse. */
export function normalizeTitle(title: string): string {
  return strip(title)
    .replace(/\((?:[fhnmx]\s*[/\-.]\s*)+[fhnmx]\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeCompany(company: string): string {
  return strip(company).replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Lieu sans code postal ni département : « Paris (75) » et « Paris » coïncident. */
export function normalizeLocation(location: string | null): string {
  if (!location) return '';
  return strip(location).replace(/\d+/g, ' ').replace(/[^a-z]+/g, ' ').trim();
}

/** Clé de regroupement ; l'identifiant lui-même quand l'offre n'a pas de quoi être rapprochée. */
export function offerDedupKey(o: Pick<DedupableOffer, 'id' | 'source' | 'title' | 'company' | 'location'>): string {
  const company = o.company ? normalizeCompany(o.company) : '';
  const title = normalizeTitle(o.title ?? '');
  if (!company || !title) return `id:${o.id}`;
  return `${o.source}|${company}|${title}|${normalizeLocation(o.location)}`;
}

export type Deduped<T extends DedupableOffer> = T & {
  /** Identifiants des enregistrements regroupés derrière cette carte (hors elle-même). */
  duplicateIds: string[];
};

function betterRepresentative(a: DedupableOffer, b: DedupableOffer): DedupableOffer {
  // Une offre déjà importée au Kanban, puis non archivée, puis la plus récente, puis la mieux notée.
  if ((a.kanbanId !== null) !== (b.kanbanId !== null)) return a.kanbanId !== null ? a : b;
  if (a.isArchived !== b.isArchived) return a.isArchived === 0 ? a : b;
  // Annonce republiée sous une autre référence : on garde la plus récente.
  const ta = recency(a);
  const tb = recency(b);
  if (ta !== null && tb !== null && ta !== tb) return tb > ta ? b : a;
  return b.score > a.score ? b : a;
}

function recency(o: DedupableOffer): number | null {
  const stamp = o.publishedAt ?? o.fetchedAt;
  if (!stamp) return null;
  const t = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:/.test(stamp) ? `${stamp.replace(' ', 'T')}Z` : stamp).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Fusionne les liens de pistes : un seul lien par piste, le meilleur score. */
function mergeLinks(offers: DedupableOffer[]): OfferAlertLink[] {
  const byAlert = new Map<string, OfferAlertLink>();
  for (const offer of offers) {
    for (const link of offer.alerts) {
      const current = byAlert.get(link.alertId);
      if (!current || link.score > current.score) byAlert.set(link.alertId, link);
    }
  }
  return [...byAlert.values()];
}

/**
 * Regroupe les enregistrements qui décrivent la même annonce. L'ordre d'entrée
 * est conservé (position du premier membre de chaque groupe).
 */
export function dedupeOffers<T extends DedupableOffer>(offers: T[]): Array<Deduped<T>> {
  const groups = new Map<string, T[]>();
  for (const offer of offers) {
    const key = offerDedupKey(offer);
    const group = groups.get(key);
    if (group) group.push(offer);
    else groups.set(key, [offer]);
  }

  const out: Array<Deduped<T>> = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push({ ...group[0], duplicateIds: [] });
      continue;
    }
    const rep = group.reduce((best, o) => betterRepresentative(best, o) as T);
    out.push({
      ...rep,
      alerts: mergeLinks(group),
      score: Math.max(...group.map(o => o.score)),
      duplicateIds: group.filter(o => o.id !== rep.id).map(o => o.id),
    });
  }
  return out;
}

/** Retire les lignes répétées par une jointure (même id) en gardant la première. */
export function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}
