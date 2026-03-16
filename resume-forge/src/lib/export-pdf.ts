import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

// Dimensions A4 en mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Neutralise les couleurs oklch() / color-mix() que html2canvas ne sait
 * pas parser.  Deux actions :
 *
 * 1. Désactive temporairement toutes les <style>/<link> dont le contenu
 *    brut contient "oklch" (c'est ce qui fait crasher le parser CSS
 *    interne de html2canvas).
 * 2. Injecte un <style> de remplacement qui redéclare toutes les
 *    CSS custom properties de :root avec leurs valeurs *computed*
 *    (toujours en rgb()/rgba()).
 * 3. Force les propriétés couleur en inline sur chaque élément du
 *    sous-arbre pour que html2canvas n'ait jamais besoin de résoudre
 *    de variable ni de couleur moderne.
 *
 * Retourne une fonction de restauration.
 */
function neutralizeModernColors(root: HTMLElement): () => void {
  // ── 1. Disable stylesheets containing oklch ──
  const disabledSheets: { sheet: CSSStyleSheet; el: HTMLStyleElement | HTMLLinkElement }[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      // Check if the owning element's text or any rule contains oklch
      const ownerEl = sheet.ownerNode as HTMLStyleElement | HTMLLinkElement | null;
      if (!ownerEl) continue;

      let hasOklch = false;
      if (ownerEl instanceof HTMLStyleElement && ownerEl.textContent?.includes('oklch')) {
        hasOklch = true;
      } else {
        // For <link> stylesheets, check the rules
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule.cssText.includes('oklch')) { hasOklch = true; break; }
          }
        } catch { /* cross-origin, skip */ }
      }

      if (hasOklch) {
        sheet.disabled = true;
        disabledSheets.push({ sheet, el: ownerEl as any });
      }
    } catch { /* skip inaccessible sheets */ }
  }

  // ── 2. Inject replacement <style> with resolved CSS custom properties ──
  const rootComputed = getComputedStyle(document.documentElement);
  const overrideRules: string[] = [];

  // Read all custom properties (--xxx) from :root and re-declare them
  // with their computed rgb() values.
  // getComputedStyle doesn't enumerate custom properties in all browsers,
  // so we extract variable names from the disabled sheets' text.
  const varNames = new Set<string>();
  for (const { el } of disabledSheets) {
    if (el instanceof HTMLStyleElement && el.textContent) {
      const matches = el.textContent.matchAll(/(--[\w-]+)\s*:/g);
      for (const m of matches) varNames.add(m[1]);
    }
  }

  const rootVarRules: string[] = [];
  for (const varName of varNames) {
    const val = rootComputed.getPropertyValue(varName).trim();
    if (val) rootVarRules.push(`  ${varName}: ${val};`);
  }
  if (rootVarRules.length > 0) {
    overrideRules.push(`:root {\n${rootVarRules.join('\n')}\n}`);
  }

  const overrideStyle = document.createElement('style');
  overrideStyle.setAttribute('data-pdf-export', 'true');
  overrideStyle.textContent = overrideRules.join('\n');
  document.head.appendChild(overrideStyle);

  // ── 3. Force inline computed colors on all elements ──
  const COLOR_PROPS = [
    'color', 'backgroundColor', 'borderColor',
    'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
    'outlineColor', 'textDecorationColor',
  ] as const;

  const savedInline: { el: HTMLElement; cssProp: string; prev: string }[] = [];
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];

  for (const el of elements) {
    const computed = getComputedStyle(el);
    for (const prop of COLOR_PROPS) {
      const val = computed[prop as any] as string;
      if (!val) continue;
      const cssProp = prop.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
      savedInline.push({ el, cssProp, prev: el.style.getPropertyValue(cssProp) });
      (el.style as any)[prop] = val;
    }
  }

  // ── Cleanup function ──
  return () => {
    // Restore inline styles
    for (const { el, cssProp, prev } of savedInline) {
      if (prev) {
        el.style.setProperty(cssProp, prev);
      } else {
        el.style.removeProperty(cssProp);
      }
    }
    // Remove injected override style
    overrideStyle.remove();
    // Re-enable disabled stylesheets
    for (const { sheet } of disabledSheets) {
      sheet.disabled = false;
    }
  };
}

/**
 * Exporte le CV en PDF via html2canvas + jsPDF.
 * Rasterise le contenu de #printable-cv en canvas haute résolution,
 * puis génère un PDF A4 sans marges supplémentaires.
 * Compatible Windows 11 (WebView2) et Ubuntu (WebKitGTK).
 *
 * Retourne true si le PDF a été sauvegardé, false si annulé ou absent.
 */
export async function exportNativePdf(): Promise<boolean> {
  const cv = document.getElementById('printable-cv') as HTMLElement | null;
  if (!cv) return false;

  // Sauvegarder les styles originaux pour restauration
  const originalStyle = cv.getAttribute('style') || '';
  const originalClass = cv.getAttribute('class') || '';

  // Neutralize oklch/color-mix/var() colors for html2canvas compatibility
  const restoreColors = neutralizeModernColors(cv);

  try {
    // Préparer l'élément pour le rendu : forcer une largeur A4 fixe
    // en pixels CSS (210mm ≈ 794px à 96 DPI)
    const a4WidthPx = 794;
    cv.style.width = `${a4WidthPx}px`;
    cv.style.maxWidth = `${a4WidthPx}px`;
    cv.style.minWidth = `${a4WidthPx}px`;
    cv.style.boxShadow = 'none';
    cv.style.margin = '0';

    // Attendre que le reflow soit appliqué
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    // Rasteriser en haute résolution (scale 2 pour un rendu net)
    const canvas = await html2canvas(cv, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      // Capturer la taille exacte du contenu
      width: a4WidthPx,
      windowWidth: a4WidthPx,
    });

    // Calculer les dimensions pour le PDF
    const imgWidth = A4_WIDTH_MM;
    const imgHeight = (canvas.height * A4_WIDTH_MM) / canvas.width;

    // Créer le PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const imgData = canvas.toDataURL('image/png');

    // Si le contenu dépasse une page A4, on le scale pour tenir sur une page
    if (imgHeight > A4_HEIGHT_MM) {
      const scale = A4_HEIGHT_MM / imgHeight;
      const scaledWidth = imgWidth * scale;
      const scaledHeight = A4_HEIGHT_MM;
      // Centrer horizontalement si nécessaire
      const xOffset = (A4_WIDTH_MM - scaledWidth) / 2;
      pdf.addImage(imgData, 'PNG', xOffset, 0, scaledWidth, scaledHeight);
    } else {
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    }

    // Générer le blob PDF
    const pdfBlob = pdf.output('arraybuffer');

    // Demander le chemin de sauvegarde via Tauri
    const filePath = await save({
      defaultPath: 'cv_export.pdf',
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    if (!filePath) return false;

    await writeFile(filePath, new Uint8Array(pdfBlob));
    return true;
  } finally {
    // Toujours restaurer les styles originaux
    restoreColors();
    cv.setAttribute('style', originalStyle);
    cv.setAttribute('class', originalClass);
  }
}
