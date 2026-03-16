import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

// Dimensions A4 en mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** CSS colour properties that html2canvas parses with its internal
 *  color parser (which doesn't support oklch/lab/lch).  We force
 *  these to their computed rgb/hex values via inline styles. */
const COLOR_PROPS = [
  'color', 'backgroundColor', 'borderColor',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'outlineColor', 'textDecorationColor',
] as const;

/**
 * Normalise une couleur CSS (oklch, lab, lch, color()…) vers un
 * format compatible html2canvas : #rrggbb ou rgba().
 *
 * On utilise le setter/getter de CanvasRenderingContext2D.fillStyle
 * qui, par spec, sérialise toujours en #rrggbb (opaque) ou en
 * rgba(r, g, b, a) (semi-transparent).
 */
const _colorCtx = document.createElement('canvas').getContext('2d')!;
function toRgbString(raw: string): string {
  // Fast path – already rgb/rgba/hex → skip canvas round-trip
  if (/^(rgb|#)/i.test(raw)) return raw;
  _colorCtx.fillStyle = '#000000'; // reset
  _colorCtx.fillStyle = raw;
  return _colorCtx.fillStyle;
}

/**
 * Force les couleurs computed en inline (format rgb/hex) sur chaque
 * élément du sous-arbre.
 *
 * WebKit (macOS Tauri) peut retourner oklch() depuis getComputedStyle ;
 * on convertit donc systématiquement vers rgb/hex via canvas 2D avant
 * d'appliquer en inline.
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
      el.style.setProperty(cssProp, toRgbString(val), 'important');
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
 * html2canvas v1.4.1 ne supporte que rgb/rgba/hsl/hsla dans son
 * parser CSS interne.  Tailwind v4 utilise oklch() partout, et
 * WebKit (macOS) peut retourner oklch() depuis getComputedStyle().
 *
 * On force donc TOUTES les couleurs en rgb/hex inline !important
 * sur les éléments du CV AVANT l'appel à html2canvas.
 */
export async function exportNativePdf(): Promise<boolean> {
  const cv = document.getElementById('printable-cv') as HTMLElement | null;
  if (!cv) return false;

  // ── 1. Save original style before any mutation ──
  const originalStyle = cv.getAttribute('style') || '';

  // ── 2. Force inline rgb colours on all CV elements ──
  const restoreColors = forceInlineColors(cv);

  // ── 3. Temporarily set A4 width ──
  const a4WidthPx = 794;
  cv.style.setProperty('width', `${a4WidthPx}px`, 'important');
  cv.style.setProperty('max-width', `${a4WidthPx}px`, 'important');
  cv.style.setProperty('min-width', `${a4WidthPx}px`, 'important');
  cv.style.setProperty('box-shadow', 'none', 'important');
  cv.style.setProperty('margin', '0', 'important');

  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  try {
    // ── 4. Rasterise via html2canvas ──
    const canvas = await html2canvas(cv, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: a4WidthPx,
      windowWidth: a4WidthPx,
    });

    // ── 5. Generate PDF ──
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
    // ── 6. Restore everything ──
    restoreColors();
    if (originalStyle) {
      cv.setAttribute('style', originalStyle);
    } else {
      cv.removeAttribute('style');
    }
  }
}
