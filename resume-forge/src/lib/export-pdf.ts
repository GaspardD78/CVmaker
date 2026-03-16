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
 * Exporte le CV en PDF via html2canvas + jsPDF.
 *
 * html2canvas ne supporte que rgb/rgba/hsl/hsla dans son parser
 * CSS interne.  Les couleurs oklch() (utilisées par Tailwind v4)
 * tombent en transparent grâce au patch html2canvas.
 *
 * Pour que les couleurs soient correctes dans le PDF, on pré-
 * calcule les couleurs computed (toujours rgb) depuis le DOM vivant
 * et on les applique en inline sur les éléments clonés via onclone.
 */
export async function exportNativePdf(): Promise<boolean> {
  const cv = document.getElementById('printable-cv') as HTMLElement | null;
  if (!cv) return false;

  // ── 1. Pre-compute resolved (rgb) colours from the live DOM ──
  const liveElements = [cv, ...Array.from(cv.querySelectorAll<HTMLElement>('*'))];
  const computedColors: Record<string, string>[] = [];

  for (const el of liveElements) {
    const cs = getComputedStyle(el);
    const colors: Record<string, string> = {};
    for (const prop of COLOR_PROPS) {
      const val = (cs as any)[prop] as string;
      if (val) colors[prop] = val;
    }
    computedColors.push(colors);
  }

  // ── 2. Temporarily set A4 width on the live CV element ──
  const originalStyle = cv.getAttribute('style') || '';
  const a4WidthPx = 794;
  cv.style.width = `${a4WidthPx}px`;
  cv.style.maxWidth = `${a4WidthPx}px`;
  cv.style.minWidth = `${a4WidthPx}px`;
  cv.style.boxShadow = 'none';
  cv.style.margin = '0';

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
      onclone: (_clonedDoc: Document, clonedCv: HTMLElement) => {
        // Force pre-computed rgb colours on cloned elements so that
        // html2canvas sees rgb() instead of oklch() (which would
        // fall back to transparent via our patch).
        const clonedElements = [clonedCv, ...Array.from(clonedCv.querySelectorAll<HTMLElement>('*'))];
        for (let i = 0; i < clonedElements.length && i < computedColors.length; i++) {
          const el = clonedElements[i];
          const colors = computedColors[i];
          for (const [prop, val] of Object.entries(colors)) {
            (el.style as any)[prop] = val;
          }
        }
      },
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
    // ── 5. Restore sizing ──
    if (originalStyle) {
      cv.setAttribute('style', originalStyle);
    } else {
      cv.removeAttribute('style');
    }
  }
}
