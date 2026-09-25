/**
 * Page de test golden.
 *
 * Rend le vrai <PrintableCV> avec les données injectées par Playwright
 * (window.__GOLDEN_CASE__), puis appelle la vraie fonction exportNativePdf().
 * Seuls les modules Tauri sont simulés (voir vite.golden.config.ts) :
 * invoke('generate_pdf') capture le HTML final au lieu d'appeler Rust.
 * La mesure de dépassement de page (print-overflow.ts) est ensuite appliquée
 * à ce même HTML (window.__GOLDEN_OVERFLOW__).
 */
import ReactDOM from 'react-dom/client';
import { PrintableCV } from '@/components/export/PrintableCV';
import { getTemplate } from '@/templates';
import { exportNativePdf } from '@/lib/export-pdf';
import { measurePrintOverflow, type PrintOverflow } from '@/lib/print-overflow';
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
  window.__GOLDEN_OVERFLOW__ = await measurePrintOverflow(window.__GOLDEN_HTML__);
}

run().catch((e) => {
  window.__GOLDEN_ERROR__ = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
});
