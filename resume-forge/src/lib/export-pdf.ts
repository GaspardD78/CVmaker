import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

// Dimensions A4 en mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Convertit une valeur oklch(...) en rgb() via le navigateur.
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
 * par leurs équivalents rgb(), avec cache.
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
 * Remplace toutes les feuilles de style contenant oklch() par des
 * versions patchées (oklch → rgb).
 *
 * Lit les règles CSS depuis le CSSOM (sheet.cssRules) et non depuis
 * textContent — ce qui couvre les styles injectés par Vite HMR via
 * sheet.insertRule().
 *
 * Gère aussi document.adoptedStyleSheets (constructed stylesheets).
 *
 * Retourne une fonction de restauration.
 */
function patchAllStyleSheets(): () => void {
  const cache = new Map<string, string>();

  // ── 1. Patch regular stylesheets (<style> and <link>) ──
  const swapped: {
    node: Node;
    parent: Node;
    replacement: HTMLStyleElement;
  }[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    let cssText = '';
    try {
      cssText = Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
    } catch {
      continue; // cross-origin, skip
    }

    if (!cssText.includes('oklch')) continue;

    const patched = replaceAllOklch(cssText, cache);

    // Create replacement <style> with patched CSS
    const replacement = document.createElement('style');
    replacement.setAttribute('data-pdf-export', 'true');
    replacement.textContent = patched;

    // Remove the original from DOM (reliable disable — sheet becomes
    // orphaned and html2canvas cannot find it).
    const ownerNode = sheet.ownerNode;
    if (ownerNode && ownerNode.parentNode) {
      const parent = ownerNode.parentNode;
      const nextSibling = ownerNode.nextSibling;
      parent.removeChild(ownerNode);
      // Insert replacement at the same position
      parent.insertBefore(replacement, nextSibling);
      swapped.push({ node: ownerNode, parent, replacement });
    }
  }

  // ── 2. Patch adopted stylesheets (constructed CSSStyleSheet) ──
  const adoptedOriginals: { sheet: CSSStyleSheet; text: string }[] = [];
  if (document.adoptedStyleSheets?.length) {
    for (const sheet of document.adoptedStyleSheets) {
      let cssText = '';
      try {
        cssText = Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
      } catch {
        continue;
      }
      if (!cssText.includes('oklch')) continue;
      adoptedOriginals.push({ sheet, text: cssText });
      sheet.replaceSync(replaceAllOklch(cssText, cache));
    }
  }

  // ── Restore ──
  return () => {
    // Restore adopted stylesheets
    for (const { sheet, text } of adoptedOriginals) {
      sheet.replaceSync(text);
    }
    // Swap back: remove replacement, re-insert original at same position
    for (const { node, parent, replacement } of swapped) {
      parent.insertBefore(node, replacement);
      replacement.remove();
    }
  };
}

/**
 * Exporte le CV en PDF via html2canvas + jsPDF.
 *
 * html2canvas embarque un parser CSS qui ne supporte pas oklch().
 * Il parse les stylesheets du document original (pas du clone).
 *
 * Stratégie :
 * 1. Lire les règles CSS depuis le CSSOM (sheet.cssRules).
 * 2. Remplacer chaque oklch() par son équivalent rgb().
 * 3. Remplacer le nœud DOM original par un <style> patché.
 * 4. Appeler html2canvas.
 * 5. Restaurer les nœuds originaux.
 *
 * Les couleurs rgb sont visuellement identiques → pas de flash.
 * Restauration fiable via re-insertion DOM.
 */
export async function exportNativePdf(): Promise<boolean> {
  const cv = document.getElementById('printable-cv') as HTMLElement | null;
  if (!cv) return false;

  // ── 1. Patch stylesheets: oklch → rgb ──
  const restoreSheets = patchAllStyleSheets();

  // ── 2. Temporarily set A4 width ──
  const originalStyle = cv.getAttribute('style') || '';
  const a4WidthPx = 794;
  cv.style.width = `${a4WidthPx}px`;
  cv.style.maxWidth = `${a4WidthPx}px`;
  cv.style.minWidth = `${a4WidthPx}px`;
  cv.style.boxShadow = 'none';
  cv.style.margin = '0';

  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  try {
    // ── 3. Rasterise ──
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
