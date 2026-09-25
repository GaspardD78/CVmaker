/**
 * Page de test golden.
 *
 * Rend le vrai <PrintableCV> avec les données injectées par Playwright
 * (window.__GOLDEN_CASE__), puis appelle la vraie fonction exportNativePdf().
 * Seuls les modules Tauri sont simulés (voir vite.golden.config.ts) :
 * invoke('generate_pdf') capture le HTML final au lieu d'appeler Rust.
 * La mesure de dépassement de page (print-overflow.ts) est ensuite appliquée
 * à ce même HTML (window.__GOLDEN_OVERFLOW__), puis des auto-tests vérifient
 * la mémorisation des mesures, la réutilisation par l'export et l'ancrage des
 * lignes dans l'aperçu (window.__GOLDEN_CHECKS__ : liste des échecs).
 *
 * Mode « fit » (suite fit du banc, data.fit) : avant l'export, l'ajustement à
 * une page (src/lib/fit-to-page.tsx) est lancé comme dans l'app, le CV est
 * rendu avec les réglages obtenus, puis exporté (window.__GOLDEN_FIT__).
 */
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import {
  fitToPage,
  measureWithPatch,
  readEffectiveValues,
  type EffectiveValues,
  type FitPatch,
  type FitResult,
  type FitSettingKey,
} from '@/lib/fit-to-page';
import { PrintableCV } from '@/components/export/PrintableCV';
import { getTemplate } from '@/templates';
import { exportNativePdf } from '@/lib/export-pdf';
import {
  cachedPrintOverflow,
  clearPrintOverflowCache,
  measurePrintOverflow,
  overflowStatus,
  resolveLineAnchor,
  type PrintOverflow,
} from '@/lib/print-overflow';
import type { CVBlock, CVDocument } from '@/types/cv';
import type { MasterEntry, Profile } from '@/types/profile';
import '@/App.css';

interface GoldenCase {
  cv: CVDocument;
  profile: Profile;
  blocks: CVBlock[];
  entries: MasterEntry[];
  /** Suite fit : lancer l'ajustement à une page avant l'export. */
  fit?: boolean;
}

/** Compte rendu de l'ajustement, lu par le banc. */
export interface GoldenFitReport {
  kind: FitResult['kind'];
  patch: FitPatch;
  stateIndex: number | null;
  ladderLength: number | null;
  measurements: number;
  ms: number;
  initialStatus: string | null;
  finalRemainingMm: number | null;
  floorOverflowMm: number | null;
  floorFirstCut: string | null;
}

declare global {
  interface Window {
    __GOLDEN_CASE__?: GoldenCase;
    __GOLDEN_HTML__?: string;
    __GOLDEN_OVERFLOW__?: PrintOverflow;
    __GOLDEN_CHECKS__?: string[];
    __GOLDEN_FIT__?: GoldenFitReport;
    __GOLDEN_ERROR__?: string;
    __TAURI_INTERNALS__?: unknown;
  }
}

// isTauri() teste la présence de cette clé : on emprunte le chemin desktop.
window.__TAURI_INTERNALS__ = {};

async function run() {
  const data = window.__GOLDEN_CASE__;
  if (!data) throw new Error('window.__GOLDEN_CASE__ absent');
  const template = getTemplate(data.cv.templateId);

  // Même conteneur que l'aperçu (RightPanel) : largeur A4.
  const container = document.getElementById('root')!;
  container.style.width = '210mm';
  const root = ReactDOM.createRoot(container);
  const renderCv = (cv: CVDocument) => flushSync(() => {
    root.render(
      <div>
        <PrintableCV cv={cv} profile={data.profile} blocks={data.blocks} entries={data.entries} template={template} />
      </div>,
    );
  });
  renderCv(data.cv);
  await document.fonts.ready;

  let fit: { result: FitResult; report: GoldenFitReport; checks: string[] } | null = null;
  if (data.fit) {
    fit = await runFit(data, template);
    if (fit.result.kind === 'fitted') {
      data.cv = { ...data.cv, settings: { ...(data.cv.settings || {}), ...fit.result.patch } };
      renderCv(data.cv);
    }
  }

  const ok = await exportNativePdf();
  if (!ok || !window.__GOLDEN_HTML__) throw new Error(`exportNativePdf a renvoyé ${ok} sans HTML capturé`);
  const html = window.__GOLDEN_HTML__;
  const overflow = await measurePrintOverflow(html);
  const checks = await selfChecks(html, overflow);
  if (fit) {
    checks.push(...fit.checks, ...fitExportChecks(fit.result, overflow));
    window.__GOLDEN_FIT__ = fit.report;
  }
  window.__GOLDEN_CHECKS__ = checks;
  // Publié en dernier : render.ts attend cette valeur pour lire les résultats.
  window.__GOLDEN_OVERFLOW__ = overflow;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const FIT_KEYS: FitSettingKey[] = ['entrySpacing', 'sectionHeaderGap', 'entryTitleGap', 'pageMargin', 'bodyLineHeight', 'bodyFontSize'];

/** Valeurs effectives d'un CV rendu dans un conteneur attaché (styles calculés). */
function effectiveFor(cv: CVDocument, data: GoldenCase, template: ReturnType<typeof getTemplate>): EffectiveValues {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:210mm;';
  document.body.appendChild(host);
  const r = ReactDOM.createRoot(host);
  try {
    flushSync(() => r.render(<PrintableCV cv={cv} profile={data.profile} blocks={data.blocks} entries={data.entries} template={template} />));
    return readEffectiveValues(host.querySelector<HTMLElement>('#printable-cv')!);
  } finally {
    r.unmount();
    host.remove();
  }
}

/**
 * Ajustement à une page, comme dans l'app, avec ses auto-tests :
 * annulation, réglages écrits (seulement ceux modifiés), changement de template.
 */
async function runFit(data: GoldenCase, template: ReturnType<typeof getTemplate>) {
  const checks: string[] = [];
  const input = { cv: data.cv, profile: data.profile, blocks: data.blocks, entries: data.entries, template };
  const effective = readEffectiveValues(document.getElementById('printable-cv')!);

  // Annulation après la première mesure : rien ne doit être renvoyé à appliquer.
  const controller = new AbortController();
  const cancelled = await fitToPage(input, effective, {
    signal: controller.signal,
    measure: async (i, p, s) => { const r = await measureWithPatch(i, p, s); controller.abort(); return r; },
  });
  if (cancelled.kind !== 'cancelled' && cancelled.kind !== 'already') fits(checks, `ajustement annulé : résultat « ${cancelled.kind} » au lieu de « cancelled »`);

  const result = await fitToPage(input, effective);
  const original = (data.cv.settings || {}) as Record<string, unknown>;

  if (result.kind === 'fitted') {
    if (overflowStatus(result.overflow) !== 'tient') fits(checks, `ajustement annoncé réussi mais statut « ${overflowStatus(result.overflow)} »`);
    // Seuls les réglages modifiés sont écrits.
    for (const [key, value] of Object.entries(result.patch)) {
      if (!FIT_KEYS.includes(key as FitSettingKey)) fits(checks, `réglage inattendu dans le patch : ${key}`);
      if (original[key] === value) fits(checks, `réglage écrit sans être modifié : ${key}=${value}`);
    }
    // Changement de template : les réglages non modifiés (vides) reprennent les valeurs du nouveau template.
    const other = getTemplate(template.id === 'minimalist' ? 'executive' : 'minimalist');
    const withPatch = { ...data.cv, templateId: other.id, settings: { ...original, ...result.patch } };
    const without = { ...data.cv, templateId: other.id, settings: { ...original } };
    const a = effectiveFor(withPatch, data, other), b = effectiveFor(without, data, other);
    const leverOf: Record<keyof EffectiveValues, FitSettingKey> = {
      entrySpacingPx: 'entrySpacing', sectionGapPx: 'sectionHeaderGap', titleGapPx: 'entryTitleGap', lineHeight: 'bodyLineHeight', bodyFontPx: 'bodyFontSize',
    };
    for (const [field, key] of Object.entries(leverOf) as [keyof EffectiveValues, FitSettingKey][]) {
      if (key in result.patch) {
        const want = parseFloat(result.patch[key]!);
        if (a[field] !== null && Math.abs((a[field] as number) - want) > 0.01) fits(checks, `changement de template : ${key} devrait rester ${result.patch[key]}, lu ${a[field]}`);
      } else if (a[field] !== b[field]) {
        fits(checks, `changement de template : ${key} non modifié par l'ajustement devrait suivre le template (${b[field]}), lu ${a[field]}`);
      }
    }
  }
  if (result.kind === 'failed' && overflowStatus(result.atFloor) === 'tient') fits(checks, "échec annoncé alors que l'état plancher tient");

  const report: GoldenFitReport = {
    kind: result.kind,
    patch: result.kind === 'fitted' ? result.patch : {},
    stateIndex: result.kind === 'fitted' ? result.stateIndex : null,
    ladderLength: result.kind === 'fitted' || result.kind === 'failed' ? result.ladderLength : null,
    measurements: result.measurements,
    ms: result.ms,
    initialStatus: result.kind === 'cancelled' ? null : overflowStatus(result.initial),
    finalRemainingMm: result.kind === 'fitted' ? result.overflow.remainingMm : null,
    floorOverflowMm: result.kind === 'failed' ? result.atFloor.overflowMm : null,
    floorFirstCut: result.kind === 'failed' ? result.atFloor.firstCutLine?.text ?? null : null,
  };
  return { result, report, checks };
}

function fits(checks: string[], message: string) { checks.push(`ajustement : ${message}`); }

/** Le PDF exporté correspond au statut annoncé par l'ajustement. */
function fitExportChecks(result: FitResult, exported: PrintOverflow): string[] {
  const checks: string[] = [];
  if (result.kind === 'fitted') {
    if (overflowStatus(exported) !== 'tient') fits(checks, `export après ajustement : statut « ${overflowStatus(exported)} » au lieu de « tient »`);
    if (!same(exported, result.overflow)) fits(checks, "export après ajustement : mesure différente de celle annoncée par l'ajustement");
  } else if (result.kind === 'failed') {
    // Échec : rien n'est appliqué, l'export reste celui du CV d'origine.
    if (!same(exported, result.initial)) fits(checks, "échec de l'ajustement mais l'export ne correspond plus au CV d'origine");
  }
  return checks;
}

/** Mesure qui doit échouer : retourne le nom de l'erreur, ou null si elle a abouti. */
async function failure(p: Promise<unknown>): Promise<string | null> {
  try { await p; return null; } catch (e) { return e instanceof Error ? e.name : String(e); }
}

/**
 * Auto-tests de la mémorisation (print-overflow.ts) et de l'ancrage des lignes.
 * Une mesure annulée, en échec ou incomplète ne doit jamais être mémorisée,
 * donc jamais réutilisée par l'export.
 */
async function selfChecks(html: string, reference: PrintOverflow): Promise<string[]> {
  const fails: string[] = [];

  // 1. Mesure annulée en cours de route (après le chargement de l'iframe).
  clearPrintOverflowCache();
  const controller = new AbortController();
  const aborted = measurePrintOverflow(html, { signal: controller.signal });
  controller.abort();
  const abortError = await failure(aborted);
  if (abortError !== 'AbortError') fails.push(`mesure annulée : ${abortError ?? 'a abouti'} au lieu de AbortError`);
  if (cachedPrintOverflow(html)) fails.push('mesure annulée mémorisée');

  // 2. Image impossible à décoder : mesure incomplète.
  const brokenImage = html.replace('</body>', '<img src="data:image/png;base64,AAAA" alt=""></body>');
  await measurePrintOverflow(brokenImage);
  if (cachedPrintOverflow(brokenImage)) fails.push('mesure avec image non décodée mémorisée');

  // 3. Police en erreur : mesure incomplète.
  const brokenFont = html.replace('</body>',
    '<style>@font-face{font-family:GoldenBroken;src:url(data:font/woff2;base64,AAAA)}</style>' +
    '<span style="font-family:GoldenBroken">x</span></body>');
  await measurePrintOverflow(brokenFont);
  if (cachedPrintOverflow(brokenFont)) fails.push('mesure avec police en erreur mémorisée');

  // 4. Mesure en échec.
  const invalid = '<!DOCTYPE html><html><body></body></html>';
  if ((await failure(measurePrintOverflow(invalid))) === null) fails.push('mesure sans #printable-cv sans erreur');
  if (cachedPrintOverflow(invalid)) fails.push('mesure en échec mémorisée');

  // 5. Mesure complète : mémorisée, identique à la première mesure.
  const complete = await measurePrintOverflow(html);
  if (!same(complete, reference)) fails.push('deux mesures complètes du même HTML diffèrent');
  if (!same(cachedPrintOverflow(html), complete)) fails.push('mesure complète non mémorisée');

  // 6. L'export réutilise ce résultat : même objet que l'aperçu obtiendrait.
  let confirmed: PrintOverflow | null = null;
  const exported = await exportNativePdf('printable-cv', {
    confirmOverflow: async (o) => { confirmed = o; return false; },
  });
  const status = overflowStatus(reference);
  if (status === 'tient') {
    if (confirmed) fails.push('confirmation demandée alors que le CV tient');
    if (!exported) fails.push("export annulé alors que le CV tient");
  } else {
    if (!confirmed) fails.push(`pas de confirmation pour le statut « ${status} »`);
    else if (!same(confirmed, reference)) fails.push("la confirmation d'export n'a pas reçu la mesure de l'aperçu");
    if (exported) fails.push('export non annulé malgré le refus de confirmation');
  }

  // 7. Ancrage : les lignes clés se retrouvent dans le DOM de l'aperçu.
  const preview = document.getElementById('printable-cv')!;
  for (const [name, line] of [['première ligne coupée', reference.firstCutLine], ['dernière ligne visible', reference.lastVisibleLine]] as const) {
    if (line && !resolveLineAnchor(preview, line)) fails.push(`ancrage introuvable dans l'aperçu (${name}) : « ${line.text} »`);
  }
  return fails;
}

run().catch((e) => {
  window.__GOLDEN_ERROR__ = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
});
