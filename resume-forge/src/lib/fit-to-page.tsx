/**
 * « Ajuster à 1 page » : réduit progressivement espacements, marges,
 * interligne puis taille du texte jusqu'à ce que le CV tienne sur la page A4
 * imprimée, avec exactement la mesure de l'export desktop
 * (buildDesktopExportHtml + measurePrintOverflow + overflowStatus).
 *
 * - Succès = statut « tient » (marge ≥ OVERFLOW_SAFETY_MARGIN_MM) ; « de
 *   justesse » ne compte pas.
 * - Bornes de lisibilité explicites (FIT_MIN_*) : si le CV ne tient pas dans
 *   ces bornes, rien n'est appliqué et le résultat décrit ce qui dépasse encore.
 * - Seuls les réglages effectivement réduits sont renvoyés (`patch`) : un
 *   réglage vide (valeur du template) non modifié reste vide.
 *
 * Voir NOTES.md (lot C) et tests/golden/README.md (suite fit).
 */
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { PrintableCV } from '@/components/export/PrintableCV';
import { buildDesktopExportHtml } from '@/lib/export-pdf';
import { measurePrintOverflow, overflowStatus, type PrintOverflow } from '@/lib/print-overflow';
import type { CVBlock, CVDocument } from '@/types/cv';
import type { MasterEntry, Profile } from '@/types/profile';
import type { CVTemplate } from '@/types/template';

// ── Bornes de lisibilité ─────────────────────────────────────────────────────
/** Espace minimal entre deux entrées (réglage entrySpacing). */
export const FIT_MIN_ENTRY_SPACING_PX = 4;
/** Espace minimal sous un titre de section (sectionHeaderGap). */
export const FIT_MIN_SECTION_GAP_PX = 2;
/** Espace minimal sous la ligne titre d'une entrée (entryTitleGap). */
export const FIT_MIN_TITLE_GAP_PX = 2;
/** Marges minimales de la colonne principale (pageMargin), vertical puis horizontal. */
export const FIT_MIN_PAGE_MARGIN = '24px 28px';
/** Interligne minimal du texte courant (bodyLineHeight). */
export const FIT_MIN_LINE_HEIGHT = 1.2;
/** Taille minimale du texte courant (bodyFontSize) : 11 px = 8,25 pt. */
export const FIT_MIN_BODY_FONT_PX = 11;

// Grilles de valeurs essayées, de la plus grande à la plus petite.
const ENTRY_SPACING_GRID = [24, 20, 16, 12, 8, 4];
const SECTION_GAP_GRID = [16, 12, 10, 8, 6, 4, 2];
const TITLE_GAP_GRID = [8, 6, 4, 2];
const PAGE_MARGIN_GRID: [number, number][] = [[40, 44], [32, 36], [24, 28]];
const LINE_HEIGHT_GRID = [1.6, 1.5, 1.4, 1.3, 1.2];
const BODY_FONT_STEP_PX = 0.5;

/** Marges par défaut de la colonne principale des templates sidebar (PrintableCV). */
const SIDEBAR_DEFAULT_MARGIN: [number, number] = [40, 44];

/** Réglages de cv.settings que l'ajustement peut modifier. */
export type FitSettingKey = 'entrySpacing' | 'sectionHeaderGap' | 'entryTitleGap' | 'pageMargin' | 'bodyLineHeight' | 'bodyFontSize';
export type FitPatch = Partial<Record<FitSettingKey, string>>;

export interface FitInput {
  cv: CVDocument;
  profile: Profile;
  blocks: CVBlock[];
  entries: MasterEntry[];
  template: CVTemplate;
}

/** Valeurs effectives actuelles (lues dans l'aperçu), null si absentes du CV. */
export interface EffectiveValues {
  entrySpacingPx: number | null;
  sectionGapPx: number | null;
  titleGapPx: number | null;
  lineHeight: number | null;
  bodyFontPx: number | null;
}

/**
 * Lit les valeurs effectives dans l'aperçu (#printable-cv affiché). Ces
 * propriétés ne dépendent pas des règles d'impression : seul le padding de
 * #printable-cv change à l'impression, et il est traité à part (pageMargin).
 */
export function readEffectiveValues(cvElement: HTMLElement): EffectiveValues {
  const px = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const style = (sel: string, pick: (s: CSSStyleDeclaration) => number | null) => {
    const el = Array.from(cvElement.querySelectorAll<HTMLElement>(sel)).find((e) => !e.closest('.cv-sidebar'));
    return el ? pick(getComputedStyle(el)) : null;
  };
  const desc = Array.from(cvElement.querySelectorAll<HTMLElement>('.cv-desc p, .cv-desc li, p.cv-desc')).find((e) => !e.closest('.cv-sidebar'));
  let lineHeight: number | null = null;
  let bodyFontPx: number | null = null;
  if (desc) {
    const s = getComputedStyle(desc);
    bodyFontPx = px(s.fontSize);
    const lh = px(s.lineHeight);
    lineHeight = lh && bodyFontPx ? Math.round((lh / bodyFontPx) * 100) / 100 : null;
  }
  return {
    entrySpacingPx: style('.cv-entry', (s) => px(s.marginBottom)),
    sectionGapPx: style('h3', (s) => px(s.marginBottom)),
    titleGapPx: style('.cv-title-row', (s) => px(s.marginBottom)),
    lineHeight,
    bodyFontPx,
  };
}

function parseMargin(value: string): [number, number] | null {
  const parts = value.trim().split(/\s+/).map((p) => parseFloat(p));
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
  return [parts[0], parts[1] ?? parts[0]];
}

/** Un cran de l'échelle : un réglage réduit d'un pas. */
export interface FitStep { key: FitSettingKey; value: string }

/**
 * Échelle de compression : suite de pas appliqués cumulativement, du moins
 * au plus nuisible à la lecture. L'état Sᵢ = S0 + les i premiers pas.
 */
export function buildFitLadder(input: FitInput, eff: EffectiveValues): FitStep[] {
  const steps: FitStep[] = [];
  const below = (grid: number[], current: number | null, min: number, key: FitSettingKey, unit: string) => {
    if (current === null) return;
    for (const v of grid) if (v < current - 0.001 && v >= min) steps.push({ key, value: `${v}${unit}` });
  };
  below(ENTRY_SPACING_GRID, eff.entrySpacingPx, FIT_MIN_ENTRY_SPACING_PX, 'entrySpacing', 'px');
  below(SECTION_GAP_GRID, eff.sectionGapPx, FIT_MIN_SECTION_GAP_PX, 'sectionHeaderGap', 'px');
  below(TITLE_GAP_GRID, eff.titleGapPx, FIT_MIN_TITLE_GAP_PX, 'entryTitleGap', 'px');

  // Marges : à l'impression, un template une colonne sans pageMargin utilise
  // 8px 10px ; définir pageMargin les augmenterait. On ne réduit donc que les
  // marges déjà définies, ou celles de la colonne principale des sidebars.
  const isSidebar = input.template.layout === 'sidebar-left' || input.template.layout === 'sidebar-right';
  const setMargin = typeof input.cv.settings?.pageMargin === 'string' ? parseMargin(input.cv.settings.pageMargin as string) : null;
  const currentMargin = setMargin ?? (isSidebar ? SIDEBAR_DEFAULT_MARGIN : null);
  const minMargin = parseMargin(FIT_MIN_PAGE_MARGIN)!;
  if (currentMargin) {
    for (const [v, h] of PAGE_MARGIN_GRID) {
      if (v < currentMargin[0] && h < currentMargin[1] && v >= minMargin[0] && h >= minMargin[1]) {
        steps.push({ key: 'pageMargin', value: `${v}px ${h}px` });
      }
    }
  }

  if (eff.lineHeight !== null) {
    for (const v of LINE_HEIGHT_GRID) if (v < eff.lineHeight - 0.001 && v >= FIT_MIN_LINE_HEIGHT) steps.push({ key: 'bodyLineHeight', value: String(v) });
  }
  if (eff.bodyFontPx !== null) {
    const start = Math.ceil(eff.bodyFontPx / BODY_FONT_STEP_PX) * BODY_FONT_STEP_PX - BODY_FONT_STEP_PX;
    for (let v = start; v >= FIT_MIN_BODY_FONT_PX - 0.001; v -= BODY_FONT_STEP_PX) {
      if (v < eff.bodyFontPx - 0.001) steps.push({ key: 'bodyFontSize', value: `${Math.round(v * 10) / 10}px` });
    }
  }
  return steps;
}

/** Patch de l'état Sᵢ : dernière valeur de chaque réglage parmi les i premiers pas. */
export function patchAt(steps: FitStep[], i: number): FitPatch {
  const patch: FitPatch = {};
  for (const step of steps.slice(0, i)) patch[step.key] = step.value;
  return patch;
}

/**
 * Mesure le CV avec des réglages modifiés, sans toucher à l'aperçu : rendu de
 * PrintableCV dans un conteneur détaché du document, puis même chaîne que
 * l'export. Pour les mêmes réglages, le HTML est identique à celui de l'aperçu.
 */
export async function measureWithPatch(input: FitInput, patch: FitPatch, signal?: AbortSignal): Promise<PrintOverflow> {
  const container = document.createElement('div');
  const root = createRoot(container);
  let html: string;
  try {
    const cv = { ...input.cv, settings: { ...(input.cv.settings || {}), ...patch } };
    flushSync(() => {
      root.render(<PrintableCV cv={cv} profile={input.profile} blocks={input.blocks} entries={input.entries} template={input.template} />);
    });
    const el = container.querySelector<HTMLElement>('#printable-cv');
    if (!el) throw new Error('fitToPage : rendu de PrintableCV introuvable');
    html = await buildDesktopExportHtml(el);
  } finally {
    root.unmount();
  }
  return measurePrintOverflow(html, { signal });
}

export type FitResult =
  | { kind: 'already'; initial: PrintOverflow; measurements: number; ms: number }
  | { kind: 'fitted'; initial: PrintOverflow; patch: FitPatch; stateIndex: number; ladderLength: number; overflow: PrintOverflow; measurements: number; ms: number }
  | { kind: 'failed'; initial: PrintOverflow; atFloor: PrintOverflow; patchAtFloor: FitPatch; ladderLength: number; measurements: number; ms: number }
  | { kind: 'cancelled'; measurements: number; ms: number };

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/**
 * Cherche le premier état de l'échelle qui « tient », par dichotomie :
 * S0, puis l'état plancher Sₖ (échec explicite s'il ne tient pas), puis
 * recherche du plus petit i. Hauteur imprimée décroissante le long de
 * l'échelle ; seul un état effectivement mesuré « tient » est retenu.
 * Au pire 2 + ⌈log₂ k⌉ mesures.
 */
export async function fitToPage(
  input: FitInput,
  effective: EffectiveValues,
  options: { signal?: AbortSignal; measure?: typeof measureWithPatch } = {},
): Promise<FitResult> {
  const t0 = performance.now();
  const measureFn = options.measure ?? measureWithPatch;
  let measurements = 0;
  const measure = async (patch: FitPatch) => {
    if (options.signal?.aborted) throw new DOMException('Ajustement annulé', 'AbortError');
    measurements++;
    return measureFn(input, patch, options.signal);
  };
  const elapsed = () => Math.round(performance.now() - t0);
  try {
    const initial = await measure({});
    if (overflowStatus(initial) === 'tient') return { kind: 'already', initial, measurements, ms: elapsed() };

    const steps = buildFitLadder(input, effective);
    const k = steps.length;
    const floorPatch = patchAt(steps, k);
    const atFloor = k > 0 ? await measure(floorPatch) : initial;
    if (overflowStatus(atFloor) !== 'tient') {
      return { kind: 'failed', initial, atFloor, patchAtFloor: floorPatch, ladderLength: k, measurements, ms: elapsed() };
    }

    let lo = 0, hi = k; // S_lo ne tient pas, S_hi tient
    let best = atFloor;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const o = await measure(patchAt(steps, mid));
      if (overflowStatus(o) === 'tient') { hi = mid; best = o; } else lo = mid;
    }
    return { kind: 'fitted', initial, patch: patchAt(steps, hi), stateIndex: hi, ladderLength: k, overflow: best, measurements, ms: elapsed() };
  } catch (e) {
    if (isAbort(e) || options.signal?.aborted) return { kind: 'cancelled', measurements, ms: elapsed() };
    throw e;
  }
}
