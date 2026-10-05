/**
 * Import, garde-fous, simulation et application d'une réponse d'analyse
 * (`watch-analysis/v1`, spec 005).
 *
 * Rien ici n'écrit en base : `parseWatchAnalysisResponse` lit, `evaluateChanges`
 * juge, `simulatePatch` rejoue le scorer, `applyChanges` produit un NOUVEAU profil
 * de recherche. C'est l'écran qui confirme, puis persiste, avec un instantané
 * pour pouvoir annuler.
 */

import type { SearchProfile } from '@/types/job-watch';
import { hasWordMatch, type LearnedSignals } from './scorer';
import { replayScore } from './score-replay';
import { resolveExclusions, exclusionKey } from './exclusions';
import { forgetLearnedTerms, profileVocabulary, extractSignificantTerms, type LearnedDictionary } from './learning-engine';
import { isPositive, mergeOfferDuplicates, type WatchAnalysisOfferInput } from './analysis-context';
import { NEAR_IDENTICAL_THRESHOLD, normalizeTitle, titleOverlap } from './title-overlap';
import { APEC_FONCTIONS, APEC_SALAIRES, APEC_TELETRAVAIL } from './parsers/apec-ids';
import { WATCH_ANALYSIS_SCHEMA } from './analysis-prompt';

// ── Types ────────────────────────────────────────────────────────────────────

export type ListField = 'jobTitles' | 'excludeTitles' | 'skills' | 'domains' | 'apecFonctions' | 'apecTeletravail';
export type ChangeField = ListField | 'apecSalaires' | 'salaryMin' | 'salaryTarget' | 'learnedTerm';

export interface PatchChange {
  /** Identifiant stable dans l'aperçu (`champ:opération:valeur`). */
  id: string;
  field: ChangeField;
  op: 'add' | 'remove' | 'set' | 'forget';
  value: string | string[] | number;
}

export type Cause = 'requete' | 'scoring' | 'comportement' | 'marche';

export interface Justification { change: string; raison: string; impact_attendu: string }

export interface ParsedAnalysis {
  schemaOk: boolean;
  cause: Cause | null;
  constats: string[];
  changes: PatchChange[];
  justifications: Justification[];
  actionsUtilisateur: string[];
  /** Éléments ignorés ou corrigés à l'import (valeur APEC inconnue, champ mal typé…). */
  warnings: string[];
}

export type ParseResult =
  | { ok: true; value: ParsedAnalysis }
  | { ok: false; error: string };

// ── Parse tolérant ───────────────────────────────────────────────────────────

const CAUSES: Cause[] = ['requete', 'scoring', 'comportement', 'marche'];
const MAX_TERM_LENGTH = 80;
const MAX_SALARY = 1_000_000;

/** Sous-chaînes `{...}` équilibrées (les accolades dans les chaînes sont ignorées). */
function balancedObjects(text: string): string[] {
  const out: string[] = [];
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) { out.push(text.slice(start, i + 1)); break; }
      }
    }
  }
  return out;
}

function tryParse(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/^﻿/, '').replace(/,\s*([}\]])/g, '$1');
  try {
    const value: unknown = JSON.parse(cleaned);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function findAnalysisObject(text: string): Record<string, unknown> | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(m => m[1]);
  const candidates = [...fenced, ...balancedObjects(text)];
  for (const raw of candidates) {
    const obj = tryParse(raw);
    if (obj && ('patch' in obj || 'schema' in obj)) return obj;
  }
  return null;
}

const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim()) : [];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function cleanTerm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const term = value.replace(/\s+/g, ' ').trim().replace(/^["'«»]+|["'«»]+$/g, '').trim();
  return term.length >= 2 && term.length <= MAX_TERM_LENGTH ? term : null;
}

function termList(value: unknown, where: string, warnings: string[]): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) { warnings.push(`${where} : liste attendue, ignoré.`); return []; }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const term = cleanTerm(item);
    if (!term) { warnings.push(`${where} : valeur invalide ignorée (${JSON.stringify(item)}).`); continue; }
    const key = term.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(term); }
  }
  return out;
}

/** Ramène chaque valeur à son libellé canonique ; les valeurs inconnues sont ignorées avec avertissement. */
function apecList(
  value: unknown, known: Record<string, number>, where: string, warnings: string[],
): string[] {
  const byLower = new Map(Object.keys(known).map(label => [label.toLowerCase(), label]));
  const out: string[] = [];
  for (const term of termList(value, where, warnings)) {
    const canonical = byLower.get(term.toLowerCase());
    if (!canonical) { warnings.push(`${where} : « ${term} » n'est pas un libellé APEC connu, ignoré.`); continue; }
    if (!out.includes(canonical)) out.push(canonical);
  }
  return out;
}

const changeId = (field: ChangeField, op: PatchChange['op'], value: string | string[] | number): string =>
  `${field}:${op}:${Array.isArray(value) ? value.join('|') : value}`;

function salaryValue(value: unknown, where: string, warnings: string[]): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_SALARY) {
    warnings.push(`${where} : montant invalide ignoré (${JSON.stringify(value)}).`);
    return null;
  }
  return Math.round(value);
}

export function parseWatchAnalysisResponse(text: string): ParseResult {
  const obj = findAnalysisObject(text);
  if (!obj) return { ok: false, error: 'Aucun bloc JSON « watch-analysis » trouvé dans la réponse.' };

  const warnings: string[] = [];
  const schemaOk = obj.schema === WATCH_ANALYSIS_SCHEMA;
  if (!schemaOk) warnings.push(`Schéma « ${String(obj.schema ?? 'absent')} » inattendu (attendu : ${WATCH_ANALYSIS_SCHEMA}) : lecture tolérante.`);

  const diag = isRecord(obj.diagnostic) ? obj.diagnostic : {};
  const cause = CAUSES.find(c => c === diag.cause_principale) ?? null;
  const constats = stringList(diag.constats);

  const patch = isRecord(obj.patch) ? obj.patch : {};
  const changes: PatchChange[] = [];
  const push = (field: ChangeField, op: PatchChange['op'], value: string | string[] | number) =>
    changes.push({ id: changeId(field, op, value), field, op, value });

  const addRemove = (field: ListField, apec?: Record<string, number>) => {
    const raw = patch[field];
    if (raw === undefined) return;
    if (!isRecord(raw)) { warnings.push(`patch.${field} : objet {add, remove} attendu, ignoré.`); return; }
    const read = (key: 'add' | 'remove') => apec
      ? apecList(raw[key], apec, `patch.${field}.${key}`, warnings)
      : termList(raw[key], `patch.${field}.${key}`, warnings);
    const adds = read('add');
    const removes = read('remove');
    for (const t of removes) push(field, 'remove', t);
    for (const t of adds) if (!removes.some(r => r.toLowerCase() === t.toLowerCase())) push(field, 'add', t);
  };
  addRemove('jobTitles');
  addRemove('excludeTitles');
  addRemove('skills');
  addRemove('domains');
  addRemove('apecFonctions', APEC_FONCTIONS);
  addRemove('apecTeletravail', APEC_TELETRAVAIL);

  if (patch.apecSalaires !== undefined) {
    const raw = patch.apecSalaires;
    const set = isRecord(raw) ? apecList(raw.set, APEC_SALAIRES, 'patch.apecSalaires.set', warnings) : [];
    if (!isRecord(raw)) warnings.push('patch.apecSalaires : objet {set} attendu, ignoré.');
    // Liste vide = « ne rien changer » (comme les autres champs), jamais « tout effacer ».
    if (set.length > 0) push('apecSalaires', 'set', set);
  }

  if (isRecord(patch.salary)) {
    const min = salaryValue(patch.salary.min, 'patch.salary.min', warnings);
    const target = salaryValue(patch.salary.target, 'patch.salary.target', warnings);
    if (min !== null) push('salaryMin', 'set', min);
    if (target !== null) push('salaryTarget', 'set', target);
  } else if (patch.salary !== undefined) {
    warnings.push('patch.salary : objet {min, target} attendu, ignoré.');
  }

  for (const term of termList(obj.learned_to_forget, 'learned_to_forget', warnings)) push('learnedTerm', 'forget', term);

  const justifications: Justification[] = Array.isArray(obj.justifications)
    ? obj.justifications.filter(isRecord).map(j => ({
        change: String(j.change ?? '').trim(), raison: String(j.raison ?? '').trim(),
        impact_attendu: String(j.impact_attendu ?? '').trim(),
      })).filter(j => j.change || j.raison)
    : [];
  const actionsUtilisateur = stringList(obj.actions_utilisateur);

  return { ok: true, value: { schemaOk, cause, constats, changes, justifications, actionsUtilisateur, warnings } };
}

// ── Application (pure) ───────────────────────────────────────────────────────

const sameTerm = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Applique des changements à un profil de recherche et renvoie un NOUVEAU profil.
 *
 * - `excludeTitles.add` : ajouté avec la portée par défaut (titre) ; le retrait
 *   s'applique aux deux listes d'exclusion (le patch ne distingue pas les deux).
 * - Un retrait qui viderait `jobTitles` est ignoré (jamais de piste sans intitulé par patch).
 * - Les changements `learnedTerm` ne concernent pas le profil (cf. `applyLearnedForgets`).
 */
export function applyChanges(profile: SearchProfile, changes: PatchChange[]): SearchProfile {
  const next: SearchProfile = {
    ...profile,
    jobTitles: [...profile.jobTitles], skills: [...profile.skills], domains: [...profile.domains],
    excludeTitles: [...profile.excludeTitles], excludeDomains: [...profile.excludeDomains],
    excludeScopes: { ...(profile.excludeScopes ?? {}) },
    apecFonctions: [...(profile.apecFonctions ?? [])],
    apecTeletravail: [...(profile.apecTeletravail ?? [])],
    apecSalaires: [...(profile.apecSalaires ?? [])],
    salary: { ...profile.salary },
  };

  for (const c of changes) {
    switch (c.field) {
      case 'jobTitles': case 'skills': case 'domains': case 'apecFonctions': case 'apecTeletravail': {
        const list = next[c.field] as string[];
        const value = String(c.value);
        if (c.op === 'add' && !list.some(t => sameTerm(t, value))) list.push(value);
        if (c.op === 'remove') {
          const remaining = list.filter(t => !sameTerm(t, value));
          if (c.field === 'jobTitles' && remaining.length === 0 && list.length > 0) break;
          list.splice(0, list.length, ...remaining);
        }
        break;
      }
      case 'excludeTitles': {
        const value = String(c.value);
        const known = resolveExclusions(next).some(e => sameTerm(e.term, value));
        if (c.op === 'add' && !known) next.excludeTitles.push(value);
        if (c.op === 'remove') {
          next.excludeTitles = next.excludeTitles.filter(t => !sameTerm(t, value));
          next.excludeDomains = next.excludeDomains.filter(t => !sameTerm(t, value));
          delete next.excludeScopes![exclusionKey(value)];
        }
        break;
      }
      case 'apecSalaires':
        if (c.op === 'set') next.apecSalaires = [...(c.value as string[])];
        break;
      case 'salaryMin':    next.salary.min = Number(c.value); break;
      case 'salaryTarget': next.salary.target = Number(c.value); break;
      case 'learnedTerm': break;
    }
  }
  if (Object.keys(next.excludeScopes ?? {}).length === 0) delete next.excludeScopes;
  return next;
}

/** Applique les changements `learnedTerm` au dictionnaire appris de la piste. */
export function applyLearnedForgets(dict: LearnedDictionary, changes: PatchChange[]): LearnedDictionary {
  return forgetLearnedTerms(dict, changes.filter(c => c.field === 'learnedTerm').map(c => String(c.value)));
}

// ── Garde-fous ───────────────────────────────────────────────────────────────

/** Part d'offres récentes touchées par une exclusion au-delà de laquelle on avertit. */
export const EXCLUSION_REACH_WARNING = 0.2;

export type GuardStatus = 'ok' | 'warn' | 'blocked' | 'noop';

export interface EvaluatedChange {
  change: PatchChange;
  status: GuardStatus;
  reasons: string[];
  /** Un changement bloqué peut être forcé par l'utilisateur, sauf mention contraire. */
  forceable: boolean;
}

export interface GuardContext {
  searchProfile: SearchProfile;
  learnedDict: LearnedDictionary;
  otherTracks: Array<{ name: string; jobTitles: string[] }>;
  /** Offres de la piste sur la période récente. */
  offers: WatchAnalysisOfferInput[];
}

const shortList = (titles: string[]): string => titles.slice(0, 3).map(t => `« ${t} »`).join(', ');

export function evaluateChanges(changes: PatchChange[], ctx: GuardContext): EvaluatedChange[] {
  const offers = mergeOfferDuplicates(ctx.offers);
  const wanted = offers.filter(isPositive);
  const vocabulary = profileVocabulary(ctx.searchProfile);
  const remainingTitles = new Set(ctx.searchProfile.jobTitles.map(normalizeTitle));
  const out: EvaluatedChange[] = [];

  for (const change of changes) {
    const result: EvaluatedChange = { change, status: 'ok', reasons: [], forceable: true };
    const value = change.value;
    const block = (reason: string, forceable = true) => {
      result.status = 'blocked'; result.reasons.push(reason); result.forceable = forceable;
    };
    const warn = (reason: string) => {
      if (result.status === 'ok') result.status = 'warn';
      result.reasons.push(reason);
    };

    if (change.field === 'excludeTitles' && change.op === 'add') {
      const term = String(value);
      if (resolveExclusions(ctx.searchProfile).some(e => sameTerm(e.term, term))) {
        result.status = 'noop'; result.reasons.push('Déjà exclu.');
      } else {
        const hits = wanted.filter(o => hasWordMatch(term, `${o.title} ${o.snippet ?? ''}`));
        if (hits.length > 0) {
          block(`« ${term} » figure dans ${hits.length} offre(s) importée(s) ou bien notée(s) : ${shortList(hits.map(h => h.title))}.`);
        }
        const tokens = extractSignificantTerms(term);
        if (tokens.length > 0 && tokens.every(t => vocabulary.has(t))) {
          block(`« ${term} » recoupe les intitulés, mots-clés ou domaines de la piste.`);
        }
        if (offers.length > 0) {
          const reach = offers.filter(o => hasWordMatch(term, o.title)).length / offers.length;
          if (reach > EXCLUSION_REACH_WARNING) {
            warn(`Touche ${Math.round(reach * 100)} % des offres récentes (seuil ${Math.round(EXCLUSION_REACH_WARNING * 100)} %).`);
          }
        }
      }
    }

    if (change.field === 'jobTitles' && change.op === 'add') {
      const key = normalizeTitle(String(value));
      if (remainingTitles.has(key)) {
        result.status = 'noop'; result.reasons.push('Intitulé déjà présent.');
      } else {
        const after = [...remainingTitles, key];
        const covering = ctx.otherTracks.filter(t =>
          t.jobTitles.some(j => normalizeTitle(j) === key) && titleOverlap(after, t.jobTitles) > NEAR_IDENTICAL_THRESHOLD);
        for (const t of covering) {
          block(`Intitulé déjà porté par la piste « ${t.name} » (recouvrement ${Math.round(titleOverlap(after, t.jobTitles) * 100)} %) : les deux pistes convergeraient.`);
        }
        remainingTitles.add(key);
      }
    }

    if (change.field === 'jobTitles' && change.op === 'remove') {
      const key = normalizeTitle(String(value));
      if (!remainingTitles.has(key)) {
        result.status = 'noop'; result.reasons.push('Intitulé absent de la piste.');
      } else if (remainingTitles.size === 1) {
        block('Retirerait le dernier intitulé visé : la piste ne chercherait plus rien.', false);
      } else {
        remainingTitles.delete(key);
      }
    }

    if (change.field === 'salaryMin' || change.field === 'salaryTarget') {
      const min = change.field === 'salaryMin' ? Number(value) : ctx.searchProfile.salary.min;
      const target = change.field === 'salaryTarget' ? Number(value) : ctx.searchProfile.salary.target;
      if (min != null && target != null && min > target) {
        block(`Salaire minimum (${min} €) supérieur au salaire cible (${target} €).`, false);
      }
    }

    if (change.field === 'learnedTerm') {
      const term = String(value).toLowerCase();
      if (!(term in ctx.learnedDict.positive) && !(term in ctx.learnedDict.negative)) {
        result.status = 'noop'; result.reasons.push('Terme absent des signaux appris.');
      }
    }
    out.push(result);
  }
  return out;
}

// ── Simulation ───────────────────────────────────────────────────────────────

/** Seuil de « bonne » offre dans la simulation (même que le badge orange de l'interface). */
export const RELEVANT_SCORE = 40;

export interface SimulatedOffer {
  id: string;
  title: string;
  company: string | null;
  before: number;
  after: number;
  /** L'utilisateur l'a importée ou likée. */
  liked: boolean;
  /** Raison d'élimination après patch, le cas échéant. */
  reason: string | null;
}

export interface ScoreDistribution { disqualified: number; low: number; medium: number; high: number }

export interface SimulationResult {
  total: number;
  threshold: number;
  gained: SimulatedOffer[];
  lost: SimulatedOffer[];
  /** Offres perdues que l'utilisateur avait aimées ou importées : à relire avant d'appliquer. */
  lostLiked: SimulatedOffer[];
  before: ScoreDistribution;
  after: ScoreDistribution;
}

const likedByUser = (o: WatchAnalysisOfferInput): boolean =>
  o.kanban || o.actions.includes('kanban_import') || o.actions.includes('thumbs_up');

function bucket(dist: ScoreDistribution, score: number, disqualified: boolean) {
  if (disqualified) dist.disqualified += 1;
  else if (score >= 70) dist.high += 1;
  else if (score >= RELEVANT_SCORE) dist.medium += 1;
  else dist.low += 1;
}

/**
 * Rejoue le scorer sur les offres de la période avec la configuration actuelle puis
 * avec la configuration patchée. Limite assumée : seules les offres DÉJÀ collectées
 * sont rejouées ; un changement de requête (intitulés, filtres APEC) peut en ramener
 * d'autres qu'on ne peut pas simuler.
 */
export function simulatePatch(args: {
  offers: WatchAnalysisOfferInput[];
  before: SearchProfile;
  after: SearchProfile;
  learnedBefore: LearnedDictionary;
  learnedAfter?: LearnedDictionary;
  companyReputation?: Record<string, number>;
  aiFilterRule?: LearnedSignals['aiFilterRule'];
  now?: Date;
  threshold?: number;
}): SimulationResult {
  const { before, after, now = new Date(), threshold = RELEVANT_SCORE } = args;
  const offers = mergeOfferDuplicates(args.offers);
  const signalsFor = (dict: LearnedDictionary): LearnedSignals => ({
    learnedDict: dict, companyReputation: args.companyReputation, aiFilterRule: args.aiFilterRule, now,
  });
  const scoreOf = (o: WatchAnalysisOfferInput, profile: SearchProfile, dict: LearnedDictionary) => {
    const b = replayScore(o, profile, signalsFor(dict));
    return { score: Math.round(b.total), disqualified: b.disqualified, reason: b.disqualifyReason ?? null };
  };

  const result: SimulationResult = {
    total: offers.length, threshold, gained: [], lost: [], lostLiked: [],
    before: { disqualified: 0, low: 0, medium: 0, high: 0 }, after: { disqualified: 0, low: 0, medium: 0, high: 0 },
  };
  for (const o of offers) {
    const b = scoreOf(o, before, args.learnedBefore);
    const a = scoreOf(o, after, args.learnedAfter ?? args.learnedBefore);
    bucket(result.before, b.score, b.disqualified);
    bucket(result.after, a.score, a.disqualified);
    const wasIn = !b.disqualified && b.score >= threshold;
    const isIn = !a.disqualified && a.score >= threshold;
    if (wasIn === isIn) continue;
    const row: SimulatedOffer = {
      id: o.id, title: o.title, company: o.company, before: b.score, after: a.score,
      liked: likedByUser(o), reason: a.disqualified ? a.reason : null,
    };
    if (isIn) result.gained.push(row);
    else {
      result.lost.push(row);
      if (row.liked) result.lostLiked.push(row);
    }
  }
  return result;
}

// ── Instantané d'annulation ──────────────────────────────────────────────────

export interface UndoSnapshot {
  alertId: string;
  appliedAt: string;
  searchProfile: SearchProfile;
  learnedDict: LearnedDictionary;
}

export interface SnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const snapshotKey = (alertId: string) => `watch_analysis_undo:${alertId}`;

export function saveUndoSnapshot(storage: SnapshotStorage, snapshot: UndoSnapshot): boolean {
  try { storage.setItem(snapshotKey(snapshot.alertId), JSON.stringify(snapshot)); return true; } catch { return false; }
}

export function loadUndoSnapshot(storage: SnapshotStorage, alertId: string): UndoSnapshot | null {
  try {
    const raw = storage.getItem(snapshotKey(alertId));
    if (!raw) return null;
    const snap = JSON.parse(raw) as UndoSnapshot;
    return snap?.alertId === alertId && snap.searchProfile && snap.learnedDict ? snap : null;
  } catch { return null; }
}

export function clearUndoSnapshot(storage: SnapshotStorage, alertId: string): void {
  try { storage.removeItem(snapshotKey(alertId)); } catch { /* stockage indisponible */ }
}

/** Libellé lisible d'un changement, pour l'aperçu en diff. */
export function describeChange(c: PatchChange): string {
  const names: Record<ChangeField, string> = {
    jobTitles: 'Intitulés visés', excludeTitles: 'Exclusions', skills: 'Mots-clés bonus', domains: 'Domaines bonus',
    apecFonctions: 'Fonctions APEC', apecTeletravail: 'Télétravail APEC', apecSalaires: 'Tranches de salaire APEC',
    salaryMin: 'Salaire minimum', salaryTarget: 'Salaire cible', learnedTerm: 'Signal appris',
  };
  const value = Array.isArray(c.value) ? c.value.join(', ') : String(c.value);
  const verb = c.op === 'add' ? '+' : c.op === 'remove' ? '−' : c.op === 'forget' ? 'oublier' : '=';
  return `${names[c.field]} : ${verb} ${value}`;
}
