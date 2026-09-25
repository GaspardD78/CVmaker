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
 */
import ReactDOM from 'react-dom/client';
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
}

declare global {
  interface Window {
    __GOLDEN_CASE__?: GoldenCase;
    __GOLDEN_HTML__?: string;
    __GOLDEN_OVERFLOW__?: PrintOverflow;
    __GOLDEN_CHECKS__?: string[];
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
  await new Promise<void>((resolve) => {
    ReactDOM.createRoot(container).render(
      <div ref={(el) => { if (el) resolve(); }}>
        <PrintableCV cv={data.cv} profile={data.profile} blocks={data.blocks} entries={data.entries} template={template} />
      </div>,
    );
  });
  await document.fonts.ready;
  const ok = await exportNativePdf();
  if (!ok || !window.__GOLDEN_HTML__) throw new Error(`exportNativePdf a renvoyé ${ok} sans HTML capturé`);
  const html = window.__GOLDEN_HTML__;
  const overflow = await measurePrintOverflow(html);
  window.__GOLDEN_CHECKS__ = await selfChecks(html, overflow);
  // Publié en dernier : render.ts attend cette valeur pour lire les résultats.
  window.__GOLDEN_OVERFLOW__ = overflow;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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
