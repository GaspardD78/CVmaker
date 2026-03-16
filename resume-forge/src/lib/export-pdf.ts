import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

// Dimensions A4 en mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Convertit une valeur oklch(...) en rgb() via le navigateur.
 * On utilise un élément temporaire : le navigateur résout oklch → rgb
 * dans getComputedStyle.
 */
function oklchToRgb(oklchValue: string): string {
  const el = document.createElement('div');
  el.style.color = oklchValue;
  el.style.display = 'none';
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).color;
  el.remove();
  return rgb || 'transparent';
}

/**
 * Remplace toutes les occurrences oklch(...) dans un texte CSS
 * par leurs équivalents rgb(), en utilisant un cache.
 */
function replaceAllOklch(cssText: string, cache: Map<string, string>): string {
  return cssText.replace(/oklch\([^)]*\)/gi, (match) => {
    let rgb = cache.get(match);
    if (!rgb) {
      rgb = oklchToRgb(match);
      cache.set(match, rgb);
    }
    return rgb;
  });
}

/**
 * Remplace le textContent des <style> contenant oklch() par une
 * version où chaque oklch(...) est converti en rgb().
 *
 * Retourne une fonction de restauration qui remet le texte original.
 * Les stylesheets restent actives (pas de sheet.disabled) donc les
 * classes Tailwind de layout/sizing/flexbox continuent de fonctionner.
 * Les couleurs rgb sont visuellement identiques → pas de flash visible.
 */
function patchStyleSheetsOklch(): () => void {
  const cache = new Map<string, string>();
  const originals: { el: HTMLStyleElement; text: string }[] = [];

  for (const style of Array.from(document.querySelectorAll<HTMLStyleElement>('style'))) {
    const text = style.textContent || '';
    if (!text.includes('oklch')) continue;

    originals.push({ el: style, text });
    style.textContent = replaceAllOklch(text, cache);
  }

  return () => {
    for (const { el, text } of originals) {
      el.textContent = text;
    }
  };
}

/**
 * Exporte le CV en PDF via html2canvas + jsPDF.
 *
 * html2canvas embarque son propre parser CSS qui ne supporte pas
 * oklch().  Il parse les stylesheets du document ORIGINAL avant
 * d'appeler onclone — on ne peut donc pas patcher seulement le
 * clone.
 *
 * Stratégie :
 * 1. Remplacer le textContent des <style> en remplaçant oklch()
 *    par les rgb() équivalents (calculés par le navigateur).
 *    Les stylesheets restent actives et visuellement identiques.
 * 2. Appeler html2canvas (qui ne voit plus que des rgb()).
 * 3. Restaurer le textContent original des <style>.
 */
export async function exportNativePdf(): Promise<boolean> {
  const cv = document.getElementById('printable-cv') as HTMLElement | null;
  if (!cv) return false;

  // ── 1. Patch <style> elements: oklch → rgb ──
  const restoreSheets = patchStyleSheetsOklch();

  // ── 2. Temporarily set A4 width on the CV element ──
  const originalStyle = cv.getAttribute('style') || '';
  const a4WidthPx = 794;
  cv.style.width = `${a4WidthPx}px`;
  cv.style.maxWidth = `${a4WidthPx}px`;
  cv.style.minWidth = `${a4WidthPx}px`;
  cv.style.boxShadow = 'none';
  cv.style.margin = '0';

  // Wait for reflow
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
    restoreSheets();
    if (originalStyle) {
      cv.setAttribute('style', originalStyle);
    } else {
      cv.removeAttribute('style');
    }
  }
}
