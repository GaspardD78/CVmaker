import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

// Dimensions A4 en mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Exporte le CV en PDF via html2canvas + jsPDF.
 *
 * html2canvas embarque son propre parser CSS qui ne supporte pas
 * oklch().  Pour contourner le problème on :
 *
 * 1. Pré-calcule TOUS les styles computed de chaque élément du CV
 *    depuis le DOM vivant (le navigateur résout oklch → rgb).
 * 2. Dans le callback `onclone` de html2canvas, on applique ces
 *    styles en inline sur les éléments clonés, puis on supprime
 *    TOUTES les feuilles de style du clone.
 *
 * Ainsi html2canvas ne parse aucune stylesheet et ne voit jamais
 * oklch().  Le DOM original n'est jamais modifié (sauf la largeur
 * A4 temporaire sur #printable-cv).
 */
export async function exportNativePdf(): Promise<boolean> {
  const cv = document.getElementById('printable-cv') as HTMLElement | null;
  if (!cv) return false;

  // ── 1. Pre-compute ALL resolved styles from the live DOM ──
  // getComputedStyle always returns resolved values (oklch → rgb, var() → value).
  const liveElements = [cv, ...Array.from(cv.querySelectorAll<HTMLElement>('*'))];
  const allComputedStyles: [string, string][][] = [];

  for (const el of liveElements) {
    const cs = getComputedStyle(el);
    const pairs: [string, string][] = [];
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i];
      const val = cs.getPropertyValue(prop);
      if (val) pairs.push([prop, val]);
    }
    allComputedStyles.push(pairs);
  }

  // ── 2. Temporarily set A4 width on the live CV element ──
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
    // ── 3. Rasterise via html2canvas, patching only the clone ──
    const canvas = await html2canvas(cv, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: a4WidthPx,
      windowWidth: a4WidthPx,
      onclone: (clonedDoc: Document, clonedCv: HTMLElement) => {
        // 3a. Apply ALL pre-computed inline styles on cloned elements.
        //     This makes every element fully self-describing — no
        //     stylesheet needed.
        const clonedElements = [clonedCv, ...Array.from(clonedCv.querySelectorAll<HTMLElement>('*'))];
        for (let i = 0; i < clonedElements.length && i < allComputedStyles.length; i++) {
          const el = clonedElements[i];
          const styles = allComputedStyles[i];
          for (const [prop, val] of styles) {
            el.style.setProperty(prop, val);
          }
        }

        // 3b. Remove ALL stylesheets from the clone — everything is
        //     now inlined.  This prevents html2canvas from ever
        //     encountering oklch() in its CSS parser.
        for (const el of Array.from(clonedDoc.querySelectorAll('style, link[rel="stylesheet"]'))) {
          el.remove();
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
    // ── 5. Restore only the sizing on the live element ──
    if (originalStyle) {
      cv.setAttribute('style', originalStyle);
    } else {
      cv.removeAttribute('style');
    }
  }
}
