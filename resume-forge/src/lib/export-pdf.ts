import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

// Dimensions A4 en mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** CSS colour properties that html2canvas parses with its internal
 *  color parser (which doesn't support oklch/lab/lch).  We force
 *  these to their computed rgb() values via inline styles. */
const COLOR_PROPS = [
  'color', 'backgroundColor', 'borderColor',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'outlineColor', 'textDecorationColor',
] as const;

/**
 * Force les couleurs computed (rgb) en inline sur chaque élément du
 * sous-arbre.  Puisque le navigateur résout oklch → rgb dans
 * getComputedStyle, les valeurs inline sont visuellement identiques.
 *
 * Retourne une fonction de restauration des styles inline d'origine.
 */
function forceInlineColors(root: HTMLElement): () => void {
  const saved: { el: HTMLElement; prop: string; prev: string }[] = [];
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];

  for (const el of elements) {
    const cs = getComputedStyle(el);
    for (const prop of COLOR_PROPS) {
      const val = (cs as any)[prop] as string;
      if (!val) continue;
      const cssProp = prop.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
      saved.push({ el, prop: cssProp, prev: el.style.getPropertyValue(cssProp) });
      el.style.setProperty(cssProp, val, 'important');
    }
  }

  return () => {
    for (const { el, prop, prev } of saved) {
      if (prev) {
        el.style.setProperty(prop, prev);
      } else {
        el.style.removeProperty(prop);
      }
    }
  };
}

/**
 * Exporte le CV en PDF via html2canvas + jsPDF.
 *
 * html2canvas ne supporte que rgb/rgba/hsl/hsla dans son parser CSS.
 * Les oklch() (Tailwind v4) sont patchés pour retourner transparent
 * (via le plugin Vite).
 *
 * Pour les couleurs correctes : on force TOUTES les couleurs computed
 * (rgb) en inline !important sur les éléments du CV AVANT l'appel à
 * html2canvas.  html2canvas clone le DOM avec ces styles inline et
 * les utilise directement (getComputedStyle retourne le rgb inline).
 *
 * Les valeurs rgb sont visuellement identiques aux oklch d'origine
 * → pas de flash perceptible.
 */
export async function exportNativePdf(): Promise<boolean> {
  const cv = document.getElementById('printable-cv') as HTMLElement | null;
  if (!cv) return false;

  // ── 1. Force inline rgb colours on all CV elements ──
  const restoreColors = forceInlineColors(cv);

  // ── 2. Temporarily set A4 width ──
  const originalStyle = cv.getAttribute('style') || '';
  const a4WidthPx = 794;
  cv.style.setProperty('width', `${a4WidthPx}px`, 'important');
  cv.style.setProperty('max-width', `${a4WidthPx}px`, 'important');
  cv.style.setProperty('min-width', `${a4WidthPx}px`, 'important');
  cv.style.setProperty('box-shadow', 'none', 'important');
  cv.style.setProperty('margin', '0', 'important');

  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  try {
    // ── 3. Rasterise via html2canvas ──
    const canvas = await html2canvas(cv, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: a4WidthPx,
      windowWidth: a4WidthPx,
    });

    // ── 4. Generate PDF ──
    const imgWidth = A4_WIDTH_MM;
    const imgHeight = (canvas.height * A4_WIDTH_MM) / canvas.width;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const imgData = canvas.toDataURL('image/png');

    if (imgHeight > A4_HEIGHT_MM) {
      const scale = A4_HEIGHT_MM / imgHeight;
      const scaledWidth = imgWidth * scale;
      const xOffset = (A4_WIDTH_MM - scaledWidth) / 2;
      pdf.addImage(imgData, 'PNG', xOffset, 0, scaledWidth, A4_HEIGHT_MM);
    } else {
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    }

    const pdfBlob = pdf.output('arraybuffer');

    const filePath = await save({
      defaultPath: 'cv_export.pdf',
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    if (!filePath) return false;

    await writeFile(filePath, new Uint8Array(pdfBlob));
    return true;
  } finally {
    // ── 5. Restore everything ──
    restoreColors();
    if (originalStyle) {
      cv.setAttribute('style', originalStyle);
    } else {
      cv.removeAttribute('style');
    }
  }
}
