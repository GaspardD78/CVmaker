/**
 * Durée d'expérience professionnelle calculée depuis les dates SOURCES du profil
 * (jamais devinée par l'IA). Utilisée par le prompt (accroche « N ans »), le
 * budget de pages et le garde-fou (nombres autorisés dans le résumé).
 */
import type { MasterEntry } from '@/types/profile';

/** Mois depuis l'an 0 d'une date `AAAA`, `AAAA-MM` ou `AAAA-MM-JJ` ; `null` si illisible. */
function toMonthIndex(value: string | null | undefined): number | null {
  const m = /^\s*(\d{4})(?:-(\d{1,2}))?/.exec(value ?? '');
  if (!m) return null;
  const month = m[2] ? Math.min(12, Math.max(1, parseInt(m[2], 10))) : 1;
  return parseInt(m[1], 10) * 12 + (month - 1);
}

/**
 * Nombre de mois d'expérience (périodes des entrées de type `experience`
 * fusionnées : deux postes simultanés ne comptent qu'une fois). Un poste en
 * cours ou sans date de fin court jusqu'à `now`.
 */
export function experienceMonths(entries: readonly MasterEntry[], now: Date = new Date()): number {
  const nowIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const spans: Array<[number, number]> = [];
  for (const e of entries) {
    if (e.entryType !== 'experience') continue;
    const start = toMonthIndex(e.startDate);
    if (start === null) continue;
    const end = e.isCurrent ? nowIndex : (toMonthIndex(e.endDate) ?? nowIndex);
    if (end >= start) spans.push([start, end]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const [s, e] of spans) {
    if (curEnd < 0 || s > curEnd) {
      if (curEnd >= 0) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  if (curEnd >= 0) total += curEnd - curStart;
  return total;
}

/** Années complètes d'expérience (arrondi à l'année inférieure). */
export function experienceYears(entries: readonly MasterEntry[], now: Date = new Date()): number {
  return Math.floor(experienceMonths(entries, now) / 12);
}

/** Pages visées : 1 jusqu'à 8 ans d'expérience, 2 au-delà (usage courant des CV IT / cyber). */
export function suggestPageBudget(years: number): number {
  return years > 8 ? 2 : 1;
}
