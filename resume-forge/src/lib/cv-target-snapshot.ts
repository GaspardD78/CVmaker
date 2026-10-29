/**
 * Ciblage proposé par l'IA (`analyse.cible`) et instantané `cv.settings.target`.
 * L'IA ne remplit que les axes laissés en auto ; elle ne remplace jamais un choix
 * explicite ni un type détecté par l'application : un désaccord est signalé, pas appliqué.
 */
import {
  FIRST_READERS, INTENTS, TARGET_TYPES, parseSheetOverrides, sheetFor,
  type AxisSource, type FirstReader, type Intent, type ResolvedTarget, type TargetBrief, type TargetChoice, type TargetSheet, type TargetType,
} from './cv-targets';

/** Choix de l'IA dans `analyse.cible` (valeurs déjà normalisées par le parseur). */
export interface AiCvCible {
  type?: TargetType;
  intent?: Intent;
  firstReader?: FirstReader;
  raison?: string;
}

export type TargetAxis = 'type' | 'intent' | 'firstReader';

export interface TargetContradiction {
  axis: TargetAxis;
  /** Valeur retenue (choix de l'utilisateur ou détection de l'application). */
  kept: string;
  /** Valeur proposée par l'IA, non appliquée. */
  proposed: string;
  keptSource: Exclude<AxisSource, 'default'>;
}

export interface AiTargetOutcome {
  /** Ciblage effectif : les axes encore par défaut reçoivent le choix de l'IA. */
  target: ResolvedTarget;
  /** Axes remplis par l'IA. */
  filled: TargetAxis[];
  /** Désaccords avec un choix explicite ou une détection : à montrer, jamais appliqués en silence. */
  contradictions: TargetContradiction[];
  raison?: string;
}

const AXES: readonly TargetAxis[] = ['type', 'intent', 'firstReader'];

/** Fusionne le choix de l'IA dans le ciblage résolu (axes par défaut seulement). */
export function reconcileAiTarget(
  resolved: ResolvedTarget,
  cible: AiCvCible | undefined,
  overrides: Parameters<typeof sheetFor>[1] = {},
): AiTargetOutcome {
  const target: ResolvedTarget = { ...resolved, sources: { ...resolved.sources } };
  const filled: TargetAxis[] = [];
  const contradictions: TargetContradiction[] = [];
  if (!cible) return { target, filled, contradictions };

  for (const axis of AXES) {
    const proposed = cible[axis];
    if (!proposed) continue;
    const current = axis === 'type' ? resolved.type : axis === 'intent' ? resolved.intent : resolved.firstReader;
    const source = resolved.sources[axis];
    if (source === 'default') {
      if (axis === 'type') {
        target.type = proposed as TargetType;
        target.sheet = sheetFor(proposed as TargetType, overrides);
      } else if (axis === 'intent') target.intent = proposed as Intent;
      else target.firstReader = proposed as FirstReader;
      target.sources[axis] = 'detected';
      filled.push(axis);
    } else if (current !== proposed) {
      contradictions.push({ axis, kept: String(current), proposed, keptSource: source });
    }
  }
  const out: AiTargetOutcome = { target, filled, contradictions };
  if (cible.raison) out.raison = cible.raison;
  return out;
}

/** Choix de l'utilisateur complété par la proposition de l'IA (axes comblés seulement), pour « Appliquer et régénérer ». */
export function choiceWithProposal(choice: TargetChoice, outcome: AiTargetOutcome): TargetChoice {
  const next: TargetChoice = { ...choice };
  for (const axis of outcome.filled) {
    if (axis === 'type' && outcome.target.type) next.type = outcome.target.type;
    else if (axis === 'intent') next.intent = outcome.target.intent;
    else if (axis === 'firstReader' && outcome.target.firstReader) next.firstReader = outcome.target.firstReader;
  }
  return next;
}

// ── Instantané `cv.settings.target` ──────────────────────────────────────────

/** Ciblage effectif au moment de la génération, fiche comprise : l'historique du CV ne suit pas les modifications des fiches. */
export interface TargetSnapshot {
  type: TargetType | null;
  intent: Intent;
  firstReader: FirstReader | null;
  sources: ResolvedTarget['sources'];
  sheet: TargetSheet | null;
  readerNote?: string;
  readerName?: string;
  readerRole?: string;
  referrerName?: string;
  brief?: TargetBrief;
  publicDetails?: ResolvedTarget['publicDetails'];
}

export function buildTargetSnapshot(target: ResolvedTarget): TargetSnapshot {
  const snap: TargetSnapshot = {
    type: target.type, intent: target.intent, firstReader: target.firstReader,
    sources: { ...target.sources }, sheet: target.sheet,
  };
  if (target.readerNote) snap.readerNote = target.readerNote;
  if (target.readerName) snap.readerName = target.readerName;
  if (target.readerRole) snap.readerRole = target.readerRole;
  if (target.referrerName) snap.referrerName = target.referrerName;
  if (target.brief) snap.brief = target.brief;
  if (target.publicDetails) snap.publicDetails = target.publicDetails;
  return snap;
}

const isSource = (v: unknown): v is AxisSource => v === 'explicit' || v === 'detected' || v === 'default';

/** Lit l'instantané d'un CV (`cv.settings.target`) ; `null` s'il est absent ou invalide. */
export function readTargetSnapshot(settings: Record<string, unknown> | null | undefined): ResolvedTarget | null {
  const raw = settings?.target;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const type = r.type === null ? null : TARGET_TYPES.find(t => t === r.type) ?? undefined;
  const intent = INTENTS.find(i => i === r.intent);
  const firstReader = r.firstReader === null ? null : FIRST_READERS.find(f => f === r.firstReader) ?? undefined;
  if (type === undefined || intent === undefined || firstReader === undefined) return null;
  const sources = r.sources as Record<string, unknown> | undefined;
  if (!sources || !isSource(sources.type) || !isSource(sources.intent) || !isSource(sources.firstReader)) return null;

  let sheet: TargetSheet | null = null;
  if (type !== null) {
    // La fiche enregistrée prime sur les fiches actuelles (validation par le même lecteur que les surcharges).
    const stored = parseSheetOverrides(JSON.stringify({ [type]: r.sheet }))[type];
    sheet = sheetFor(type, stored ? { [type]: stored } : {});
  }
  const out: ResolvedTarget = { type, intent, firstReader, sheet, sources: { type: sources.type, intent: sources.intent, firstReader: sources.firstReader } };
  if (typeof r.readerNote === 'string' && r.readerNote.trim()) out.readerNote = r.readerNote;
  for (const k of ['readerName', 'readerRole', 'referrerName'] as const) {
    if (typeof r[k] === 'string' && (r[k] as string).trim()) out[k] = r[k] as string;
  }
  if (r.brief && typeof r.brief === 'object') out.brief = r.brief as TargetBrief;
  if (r.publicDetails && typeof r.publicDetails === 'object') out.publicDetails = r.publicDetails as ResolvedTarget['publicDetails'];
  return out;
}
