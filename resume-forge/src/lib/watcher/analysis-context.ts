/**
 * Contexte factuel de l'analyse IA de la Veille (spec 005).
 *
 * `buildWatchAnalysisContext` est PUR : il reçoit des données déjà chargées
 * (cf. `analysis-loader.ts` pour la lecture en base) et renvoie un objet que
 * `analysis-prompt.ts` met en texte. Tout ce qui peut se calculer (recouvrement
 * de pistes, incohérences de configuration, décomposition du score, métriques
 * avec dénominateur) l'est ici, par du code, pas par le LLM.
 */

import type { AlertKind, JobSource, SearchProfile } from '@/types/job-watch';
import type { MasterEntry, Profile } from '@/types/profile';
import { hasWordMatch, type LearnedSignals } from './scorer';
import { replayScore } from './score-replay';
import { resolveExclusions, type ExclusionScope } from './exclusions';
import { dedupeOffers, offerDedupKey } from './deduplicator';
import {
  extractSignificantTerms, listLearnedSignals, profileVocabulary, type LearnedDictionary, type LearnedSignal,
} from './learning-engine';
import { describeEngineRules } from './engine-rules';
import { overlapWithOthers, type TrackOverlap } from './title-overlap';
import { breakdownParts } from './score-display';
import type { ScoreBreakdown } from './scorer';
import { APEC_SALAIRES } from './parsers/apec-ids';

// ── Constantes ───────────────────────────────────────────────────────────────

export const DEFAULT_PERIOD_DAYS = 30;
export const MAX_PROMPT_OFFERS = 30;
export const SNIPPET_MAX_CHARS = 200;
/** Seuil de présence d'une exclusion dans les offres souhaitées. */
export const EXCLUSION_HIT_SHARE = 0.3;
/** Score stocké à partir duquel une offre est considérée « bien notée ». */
export const GOOD_SCORE = 70;
/** Écart (en points) au-delà duquel le score enregistré est cité à côté du score recalculé. */
export const STORED_SCORE_GAP = 4;

// ── Entrées ──────────────────────────────────────────────────────────────────

export type FeedbackAction = 'kanban_import' | 'thumbs_up' | 'thumbs_down' | 'quick_archive';

export interface WatchAnalysisOfferInput {
  id: string;
  source: JobSource | string;
  title: string;
  company: string | null;
  location: string | null;
  contractType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryRaw: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  /** Score enregistré pour cette piste (peut dater d'une ancienne configuration). */
  storedScore: number;
  snippet: string | null;
  isRead: boolean;
  /** Offre importée dans le Kanban. */
  kanban: boolean;
  /** Feedbacks émis dans le contexte de la piste. */
  actions: FeedbackAction[];
}

export interface CandidateInput {
  title: string | null;
  mainSkills: string[];
  city: string | null;
  experienceYears: number | null;
}

export interface WatchAnalysisInput {
  now?: Date;
  periodDays?: number;
  alert: {
    id: string;
    name: string;
    kind?: AlertKind;
    searchProfile: SearchProfile;
    learnedDict: LearnedDictionary;
    companyReputation?: Record<string, number>;
    aiFilterRule?: LearnedSignals['aiFilterRule'];
  };
  otherAlerts: Array<{ id: string; name: string; searchProfile: SearchProfile }>;
  candidate: CandidateInput;
  offers: WatchAnalysisOfferInput[];
}

// ── Sortie ───────────────────────────────────────────────────────────────────

export interface Ratio {
  percent: number | null;
  numerator: number;
  denominator: number;
}

export interface AnalysisOffer {
  title: string;
  company: string | null;
  location: string | null;
  source: string;
  contract: string | null;
  salary: string | null;
  remote: 'complet' | 'partiel' | null;
  ageDays: number | null;
  /** Score recalculé avec la configuration actuelle, arrondi à l'entier. */
  score: number;
  /** Score enregistré, seulement s'il diffère nettement du score recalculé. */
  storedScore: number | null;
  /** Décomposition : titre, mots-clés, domaine, salaire, ancienneté (+ contrat/appris si non nuls). */
  breakdown: Array<{ label: string; points: number }>;
  /** Raison d'élimination si le moteur écarte l'offre. */
  disqualified: string | null;
  action: string;
  excerpt: string;
}

export type InconsistencyCode =
  | 'empty_track'
  | 'no_job_titles'
  | 'salary_outside_apec_band'
  | 'learned_conflicts_profile'
  | 'exclusion_overlaps_profile'
  | 'exclusion_hits_wanted_offers';

export interface Inconsistency {
  code: InconsistencyCode;
  severity: 'high' | 'medium' | 'info';
  message: string;
}

export interface WatchAnalysisContext {
  generatedAt: string;
  period: { days: number; from: string; to: string };
  track: {
    id: string;
    name: string;
    kind: AlertKind | null;
    scoringMode: SearchProfile['scoring']['mode'];
    jobTitles: string[];
    exclusions: Array<{ term: string; scope: ExclusionScope }>;
    /** Libellé exact : « Mots-clés bonus ». */
    skills: string[];
    /** Libellé exact : « Domaines bonus ». */
    domains: string[];
    requiredDomains: string[];
    contractTypes: string[];
    salary: { min: number | null; target: number | null };
    location: { label: string; radiusKm: number } | null;
    apec: { fonctions: string[]; secteurs: string[]; teletravail: string[]; salaires: string[] };
    isEmpty: boolean;
  };
  engineRules: string[];
  candidate: CandidateInput;
  portfolio: { others: Array<TrackOverlap & { jobTitles: string[] }>; nearIdentical: TrackOverlap[] };
  inconsistencies: Inconsistency[];
  metrics: {
    periodDays: number;
    offers: number;
    open: number;
    rated: number;
    imported: number;
    rejected: number;
    /** Offres sans aucun tri (ni pouce, ni archivage, ni import Kanban). */
    untreated: number;
    zeroAction: boolean;
    perWeek: number;
    pertinence: Ratio;
    conversion: Ratio;
    scoreDistribution: { disqualified: number; low: number; medium: number; high: number };
  };
  learned: { fromTitlesOnly: true; signals: LearnedSignal[] };
  offers: { total: number; shown: number; items: AnalysisOffer[] };
}

// ── Utilitaires ──────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

const ratio = (numerator: number, denominator: number): Ratio => ({
  numerator, denominator,
  percent: denominator > 0 ? Math.round((numerator / denominator) * 100) : null,
});

/** Années d'expérience : union des périodes `experience`, sans double compte des chevauchements. */
export function computeExperienceYears(entries: MasterEntry[], now: Date = new Date()): number | null {
  const toMonths = (value: string | null): number | null => {
    if (!value) return null;
    const m = /^(\d{4})(?:-(\d{1,2}))?/.exec(value.trim());
    if (!m) return null;
    return Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 0);
  };
  const nowMonths = now.getFullYear() * 12 + now.getMonth();
  const spans: Array<[number, number]> = [];
  for (const e of entries) {
    if (e.entryType !== 'experience') continue;
    const start = toMonths(e.startDate);
    if (start === null) continue;
    const end = toMonths(e.endDate) ?? (e.isCurrent || !e.endDate ? nowMonths : start);
    if (end >= start) spans.push([start, end]);
  }
  if (spans.length === 0) return null;
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = spans[0];
  for (const [s, e] of spans.slice(1)) {
    if (s <= curEnd) curEnd = Math.max(curEnd, e);
    else { total += curEnd - curStart; [curStart, curEnd] = [s, e]; }
  }
  total += curEnd - curStart;
  return Math.round(total / 12);
}

/** Profil candidat issu du profil CV et de ses entrées. */
export function buildCandidateInput(
  profile: Pick<Profile, 'title' | 'city'> | null,
  entries: MasterEntry[],
  now: Date = new Date(),
): CandidateInput {
  return {
    title: profile?.title ?? null,
    city: profile?.city ?? null,
    mainSkills: entries
      .filter(e => e.entryType === 'skill')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(e => e.title)
      .slice(0, 10),
    experienceYears: computeExperienceYears(entries, now),
  };
}

/** Bornes (en euros annuels) d'une tranche APEC ; `max` exclu. */
export function apecSalaryBand(label: string): { min: number; max: number } | null {
  let m = /moins de (\d+)\s*k/i.exec(label);
  if (m) return { min: 0, max: Number(m[1]) * 1000 };
  m = /(\d+)\s*-\s*(\d+)\s*k/i.exec(label);
  if (m) return { min: Number(m[1]) * 1000, max: Number(m[2]) * 1000 };
  m = /(\d+)\s*k.*et plus/i.exec(label);
  if (m) return { min: Number(m[1]) * 1000, max: Infinity };
  return null;
}

function remoteHint(text: string): 'complet' | 'partiel' | null {
  if (/(full[ -]?remote|100\s?%\s?(télétravail|remote)|télétravail (complet|total))/i.test(text)) return 'complet';
  if (/(télétravail|teletravail|remote|hybride)/i.test(text)) return 'partiel';
  return null;
}

function formatSalary(o: Pick<WatchAnalysisOfferInput, 'salaryMin' | 'salaryMax' | 'salaryRaw'>): string | null {
  if (o.salaryMin != null && o.salaryMax != null && o.salaryMax !== o.salaryMin) {
    return `${o.salaryMin}-${o.salaryMax} €/an`;
  }
  if (o.salaryMin != null) return `${o.salaryMin} €/an`;
  return o.salaryRaw?.trim() || null;
}

function actionLabel(o: WatchAnalysisOfferInput): string {
  if (o.kanban || o.actions.includes('kanban_import')) return 'importée dans le Kanban';
  if (o.actions.includes('thumbs_up')) return 'pouce haut';
  if (o.actions.includes('thumbs_down')) return 'pouce bas';
  if (o.actions.includes('quick_archive')) return 'archivée sans lecture';
  if (o.isRead) return 'ouverte, sans tri';
  return 'aucune action';
}

/** Titre, mots-clés, domaine, salaire et ancienneté toujours listés ; contrat et appris si non nuls. */
function explainBreakdown(b: ScoreBreakdown): Array<{ label: string; points: number }> {
  const always = new Set(['title', 'skills', 'domain', 'salary', 'age']);
  const parts = breakdownParts(b, true).filter(p => always.has(p.key) || p.points !== 0);
  return parts.map(p => ({ label: p.label, points: p.points }));
}

const isTreated = (o: WatchAnalysisOfferInput): boolean => o.kanban || o.actions.length > 0;
export const isPositive = (o: WatchAnalysisOfferInput): boolean =>
  o.kanban || o.actions.includes('kanban_import') || o.actions.includes('thumbs_up') || o.storedScore >= GOOD_SCORE;

/**
 * Dédoublonne en fusionnant les signaux : si l'un des doublons a été trié, la
 * fiche conservée le reflète (sinon un doublon « sans action » fausserait les métriques).
 */
export function mergeOfferDuplicates(rows: WatchAnalysisOfferInput[]): WatchAnalysisOfferInput[] {
  const byId = new Map<string, WatchAnalysisOfferInput>();
  for (const row of rows) {
    const prev = byId.get(row.id);
    byId.set(row.id, prev
      ? { ...prev, isRead: prev.isRead || row.isRead, kanban: prev.kanban || row.kanban,
          actions: [...new Set([...prev.actions, ...row.actions])] }
      : { ...row, actions: [...new Set(row.actions)] });
  }
  const unique = [...byId.values()].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));

  const kept = new Map<string, WatchAnalysisOfferInput>();
  for (const row of dedupeOffers(unique)) kept.set(offerDedupKey(row), row);
  for (const row of unique) {
    const target = kept.get(offerDedupKey(row));
    if (!target || target === row) continue;
    target.isRead = target.isRead || row.isRead;
    target.kanban = target.kanban || row.kanban;
    target.actions = [...new Set([...target.actions, ...row.actions])];
    target.storedScore = Math.max(target.storedScore, row.storedScore);
  }
  return [...kept.values()];
}

// ── Incohérences ─────────────────────────────────────────────────────────────

function detectInconsistencies(
  sp: SearchProfile,
  learned: LearnedDictionary,
  offers: WatchAnalysisOfferInput[],
  signals: LearnedSignal[],
): Inconsistency[] {
  const out: Inconsistency[] = [];
  const exclusions = resolveExclusions(sp);

  // Piste vide / sans intitulé
  const hasApec = (sp.apecFonctions ?? []).length > 0;
  if (sp.jobTitles.length === 0 && sp.skills.length === 0 && sp.domains.length === 0 && !hasApec) {
    out.push({ code: 'empty_track', severity: 'high',
      message: "La piste est vide : aucun intitulé, mot-clé, domaine ni fonction APEC." });
  } else if (sp.jobTitles.length === 0) {
    out.push({ code: 'no_job_titles', severity: 'medium',
      message: 'Aucun intitulé visé : tous les scores démarrent à 50 (mode permissif).' });
  }

  // Salaire cible hors tranche APEC
  const bands = (sp.apecSalaires ?? []).filter(l => l in APEC_SALAIRES)
    .map(l => ({ label: l, band: apecSalaryBand(l) }))
    .filter((b): b is { label: string; band: { min: number; max: number } } => b.band !== null);
  const target = sp.salary.target;
  if (target != null && bands.length > 0 && !bands.some(b => target >= b.band.min && target < b.band.max)) {
    out.push({ code: 'salary_outside_apec_band', severity: 'high',
      message: `Salaire cible ${target} € hors des tranches APEC sélectionnées (${bands.map(b => b.label).join(', ')}) : ` +
        "APEC ne remontera pas les offres au niveau visé." });
  }

  // Termes appris en négatif qui figurent dans le vocabulaire cible
  const conflicts = signals.filter(s => s.conflict);
  const allConflicts = Object.entries(learned.negative)
    .filter(([term]) => profileVocabulary(sp).has(term))
    .sort(([, a], [, b]) => b - a);
  if (conflicts.length > 0 || allConflicts.length > 0) {
    const shown = (conflicts.length > 0
      ? conflicts.map(c => [c.term, c.count] as const)
      : allConflicts.slice(0, 5)
    ).map(([t, c]) => `« ${t} » (${c})`);
    out.push({ code: 'learned_conflicts_profile', severity: 'high',
      message: `Termes appris comme rejetés alors qu'ils figurent dans les intitulés, mots-clés, domaines ou fonctions APEC de la piste : ${shown.join(', ')}. ` +
        "Ce signal est probablement un artefact (le titre complet est appris) : ne pas l'exploiter." });
  }

  // Exclusion qui recoupe le vocabulaire cible
  const vocab = profileVocabulary(sp);
  for (const e of exclusions) {
    const tokens = extractSignificantTerms(e.term);
    if (tokens.length > 0 && tokens.every(t => vocab.has(t))) {
      out.push({ code: 'exclusion_overlaps_profile', severity: 'high',
        message: `L'exclusion « ${e.term} » (portée ${e.scope === 'title' ? 'titre' : 'titre + description'}) recoupe le vocabulaire visé par la piste.` });
    }
  }

  // Exclusions présentes dans les offres importées ou bien notées
  const positives = offers.filter(isPositive);
  if (positives.length > 0) {
    for (const e of exclusions) {
      const hit = positives.filter(o => hasWordMatch(e.term, `${o.title} ${o.snippet ?? ''}`));
      const share = hit.length / positives.length;
      if (hit.length > 0 && share > EXCLUSION_HIT_SHARE) {
        const active = e.scope === 'title'
          ? hit.filter(o => hasWordMatch(e.term, o.title)).length
          : hit.length;
        out.push({
          code: 'exclusion_hits_wanted_offers',
          severity: active > 0 ? 'high' : 'info',
          message: `« ${e.term} » figure dans ${hit.length} des ${positives.length} offres importées ou bien notées ` +
            `(${Math.round(share * 100)} %)` +
            (active > 0
              ? ` : l'exclusion (portée ${e.scope === 'title' ? 'titre' : 'titre + description'}) en élimine ${active}.`
              : " dans leur description seulement : sans effet tant que la portée reste « titre ». Ne pas l'étendre à la description."),
        });
      }
    }
  }
  return out;
}

// ── Construction ─────────────────────────────────────────────────────────────

export function buildWatchAnalysisContext(input: WatchAnalysisInput): WatchAnalysisContext {
  const now = input.now ?? new Date();
  const days = input.periodDays ?? DEFAULT_PERIOD_DAYS;
  const sp = input.alert.searchProfile;
  const cutoff = new Date(now.getTime() - days * DAY_MS);

  const inPeriod = input.offers.filter(o => new Date(o.fetchedAt).getTime() >= cutoff.getTime());
  const offers = mergeOfferDuplicates(inPeriod);

  const signals = listLearnedSignals(input.alert.learnedDict, sp, { minCount: 3, limit: 8 });

  // Score recalculé avec la configuration actuelle, une fois par offre.
  const signalsForScorer: LearnedSignals = {
    learnedDict: input.alert.learnedDict,
    companyReputation: input.alert.companyReputation,
    aiFilterRule: input.alert.aiFilterRule,
    now,
  };
  const scored = offers.map(o => {
    const b = replayScore(o, sp, signalsForScorer);
    return { offer: o, breakdown: b, score: Math.round(b.total) };
  });

  const items: AnalysisOffer[] = scored.slice(0, MAX_PROMPT_OFFERS).map(({ offer: o, breakdown: b, score }) => {
    const ageSource = o.publishedAt ?? o.fetchedAt;
    const age = Math.floor((now.getTime() - new Date(ageSource).getTime()) / DAY_MS);
    const stored = Math.round(o.storedScore);
    return {
      title: o.title, company: o.company, location: o.location, source: String(o.source),
      contract: o.contractType, salary: formatSalary(o),
      remote: remoteHint(`${o.title} ${o.location ?? ''} ${o.snippet ?? ''}`),
      ageDays: Number.isFinite(age) ? Math.max(0, age) : null,
      score,
      storedScore: Math.abs(stored - score) > STORED_SCORE_GAP ? stored : null,
      breakdown: b.disqualified ? [] : explainBreakdown(b),
      disqualified: b.disqualified ? (b.disqualifyReason ?? 'écartée') : null,
      action: actionLabel(o),
      excerpt: (o.snippet ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_MAX_CHARS),
    };
  });

  const total = offers.length;
  const open = offers.filter(o => o.isRead).length;
  const imported = offers.filter(o => o.kanban || o.actions.includes('kanban_import')).length;
  const rejected = offers.filter(o => o.actions.includes('thumbs_down') || o.actions.includes('quick_archive')).length;
  const rated = offers.filter(o => o.actions.some(a => a === 'thumbs_up' || a === 'thumbs_down')).length;
  const untreated = offers.filter(o => !isTreated(o)).length;

  const distribution = { disqualified: 0, low: 0, medium: 0, high: 0 };
  for (const s of scored) {
    if (s.breakdown.disqualified) distribution.disqualified += 1;
    else if (s.score >= GOOD_SCORE) distribution.high += 1;
    else if (s.score >= 40) distribution.medium += 1;
    else distribution.low += 1;
  }

  const others = overlapWithOthers(
    sp.jobTitles,
    input.otherAlerts.map(a => ({ name: a.name, jobTitles: a.searchProfile.jobTitles })),
  ).map((o, i) => ({ ...o, jobTitles: input.otherAlerts[i].searchProfile.jobTitles }));

  const exclusions = resolveExclusions(sp).map(e => ({ term: e.term, scope: e.scope }));

  return {
    generatedAt: now.toISOString(),
    period: { days, from: cutoff.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
    track: {
      id: input.alert.id, name: input.alert.name, kind: input.alert.kind ?? null,
      scoringMode: sp.scoring.mode,
      jobTitles: sp.jobTitles, exclusions,
      skills: sp.skills, domains: sp.domains, requiredDomains: sp.requiredDomains ?? [],
      contractTypes: sp.contractTypes, salary: sp.salary,
      location: sp.location.label || sp.location.city
        ? { label: sp.location.label || sp.location.city, radiusKm: sp.location.radiusKm }
        : null,
      apec: {
        fonctions: sp.apecFonctions ?? [], secteurs: sp.apecSecteurs ?? [],
        teletravail: sp.apecTeletravail ?? [], salaires: sp.apecSalaires ?? [],
      },
      isEmpty: sp.jobTitles.length === 0 && sp.skills.length === 0 && sp.domains.length === 0 &&
        (sp.apecFonctions ?? []).length === 0,
    },
    engineRules: describeEngineRules(),
    candidate: input.candidate,
    portfolio: { others, nearIdentical: others.filter(o => o.nearIdentical) },
    inconsistencies: detectInconsistencies(sp, input.alert.learnedDict, offers, signals),
    metrics: {
      periodDays: days, offers: total, open, rated, imported, rejected, untreated,
      zeroAction: total > 0 && untreated === total,
      perWeek: Math.round((total / days) * 7 * 10) / 10,
      pertinence: ratio(open, total),
      conversion: ratio(imported, total),
      scoreDistribution: distribution,
    },
    learned: { fromTitlesOnly: true, signals },
    offers: { total, shown: items.length, items },
  };
}
