/**
 * Fusion d'expériences dans un CV (`mergedEntries`) : plusieurs postes anciens regroupés en une ligne,
 * ex. « Chargé de recrutement · Micropole, Matelli, Gitec · 2011 - 2015 ». Fonctions pures, partagées par
 * le garde-fou et l'application. Le profil maître n'est jamais modifié : tout passe par les surcharges des
 * blocs du CV.
 */
import { toMonthIndex } from './cv-experience';
import { displayTitle } from './entry-display';
import type { AiCvMergedEntry } from './ai-cv-response';
import type { MasterEntry } from '@/types/profile';

/** Entrées minimales nécessaires au calcul. */
type EntryLike = Pick<MasterEntry, 'id' | 'entryType' | 'title' | 'subtitle' | 'startDate' | 'endDate' | 'isCurrent' | 'description'>;

/** Ordre chronologique inverse : en cours d'abord, puis fin la plus récente, puis début le plus récent. */
function recencyKey(e: EntryLike): number {
  if (e.isCurrent) return Number.POSITIVE_INFINITY;
  const end = toMonthIndex(e.endDate);
  if (end !== null) return end;
  return toMonthIndex(e.startDate) ?? Number.NEGATIVE_INFINITY;
}

/** Entrées de la plus récente à la plus ancienne (tri stable : à égalité, l'ordre donné est conservé). */
export function sortMostRecentFirst<T extends EntryLike>(entries: readonly T[]): T[] {
  return entries
    .map((e, i) => ({ e, i, k: recencyKey(e), s: toMonthIndex(e.startDate) ?? Number.NEGATIVE_INFINITY }))
    .sort((a, b) => (b.k - a.k) || (b.s - a.s) || (a.i - b.i))
    .map(x => x.e);
}

/** Employeurs distincts (comparaison sans casse ni accents), du plus récent au plus ancien, joints par « , ». */
export function mergedEmployers(entries: readonly EntryLike[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of sortMostRecentFirst(entries)) {
    const name = e.subtitle?.trim();
    if (!name) continue;
    const key = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(name); }
  }
  return out.join(', ');
}

export interface MergedDates {
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
}

/**
 * Dates calculées, jamais fournies par l'IA : début le plus ancien, fin la plus récente, « Présent » (`isCurrent`)
 * si une entrée est en cours. Le format d'affichage est celui du CV (`formatEntryDates`).
 */
export function mergedDates(entries: readonly EntryLike[]): MergedDates {
  let start: { v: string; k: number } | null = null;
  let end: { v: string; k: number } | null = null;
  let current = false;
  for (const e of entries) {
    const s = toMonthIndex(e.startDate);
    if (e.startDate && s !== null && (!start || s < start.k)) start = { v: e.startDate, k: s };
    const en = toMonthIndex(e.endDate);
    if (e.endDate && en !== null && (!end || en > end.k)) end = { v: e.endDate, k: en };
    if (e.isCurrent) current = true;
  }
  return { startDate: start?.v ?? null, endDate: current ? null : end?.v ?? null, isCurrent: current };
}

export interface ResolvedMerge {
  /** Identifiants du groupe, du plus récent au plus ancien. */
  ids: string[];
  /** Entrée la plus récente : son bloc porte la fusion. */
  carrierId: string;
  titleOverride?: string;
  subtitle: string;
  /** Texte fusionné (peut être vide : la ligne n'affiche alors que titre, employeurs et dates). */
  description: string;
  dates: MergedDates;
  /** Source de l'anti-invention : titres, employeurs et descriptions des entrées fusionnées. */
  sourceText: string;
}

export type MergeResolution = { ok: true; merge: ResolvedMerge } | { ok: false; reason: string };

/**
 * Valide un groupe : au moins 2 identifiants distincts, tous existants, tous du même `entryType`,
 * aucun déjà pris par un groupe précédent (`taken`). Sinon le groupe est ignoré, avec la raison.
 */
export function resolveMergedGroup(
  group: Pick<AiCvMergedEntry, 'ids' | 'titleOverride' | 'subtitleOverride' | 'description'>,
  entryById: ReadonlyMap<string, EntryLike>,
  taken: ReadonlySet<string> = new Set(),
): MergeResolution {
  const ids = [...new Set(group.ids)];
  if (ids.length < 2) return { ok: false, reason: 'au moins 2 entrées sont nécessaires' };
  const unknown = ids.filter(id => !entryById.has(id));
  if (unknown.length > 0) return { ok: false, reason: `identifiant(s) inconnu(s) : ${unknown.join(', ')}` };
  const members = ids.map(id => entryById.get(id) as EntryLike);
  const type = members[0].entryType;
  if (members.some(m => m.entryType !== type)) return { ok: false, reason: 'les entrées ne sont pas toutes du même type' };
  const reused = ids.filter(id => taken.has(id));
  if (reused.length > 0) return { ok: false, reason: `entrée(s) déjà fusionnée(s) dans un autre groupe : ${reused.join(', ')}` };

  const ordered = sortMostRecentFirst<EntryLike>(members);
  const subtitle = group.subtitleOverride?.trim() || mergedEmployers(ordered);
  const title = group.titleOverride?.trim();
  return {
    ok: true,
    merge: {
      ids: ordered.map(m => m.id),
      carrierId: ordered[0].id,
      ...(title ? { titleOverride: displayTitle(title, subtitle) } : {}),
      subtitle,
      description: group.description ?? '',
      dates: mergedDates(ordered),
      sourceText: members.flatMap(m => [m.title, m.subtitle ?? '', m.description ?? '', m.startDate ?? '', m.endDate ?? '']).join('\n'),
    },
  };
}

/** Carte « identifiant du groupe -> identifiant du porteur » pour ramener `entryOrder` au bloc porteur. */
export function carrierOf(merges: readonly ResolvedMerge[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of merges) for (const id of m.ids) map.set(id, m.carrierId);
  return map;
}

/**
 * `entryOrder` ramené aux porteurs : n'importe quel identifiant d'un groupe désigne son porteur, une seule fois
 * (à la première citation).
 */
export function remapEntryOrder(order: readonly string[] | undefined, merges: readonly ResolvedMerge[]): string[] | undefined {
  if (!order) return undefined;
  const carrier = carrierOf(merges);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of order) {
    const target = carrier.get(id) ?? id;
    if (!seen.has(target)) { seen.add(target); out.push(target); }
  }
  return out;
}

/** Nombre de postes réunis par un bloc porteur (0 : le bloc ne porte pas de fusion). */
export function mergedCount(block: { overrideData?: Record<string, unknown> | null }): number {
  const from = block.overrideData?.mergedFrom;
  return Array.isArray(from) ? from.length : 0;
}

/** Le bloc est une entrée fusionnée dans une autre ligne (donc masqué par la fusion). */
export function isMergedMember(block: { overrideData?: Record<string, unknown> | null }): boolean {
  return typeof block.overrideData?.mergedInto === 'string';
}
