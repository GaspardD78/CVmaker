import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

// Dimensions A4 en mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Regex matching oklch(...) colour functions (possibly nested in other
 * functions like color-mix).  Handles optional alpha channel.
 */
const OKLCH_RE = /oklch\([^)]*\)/gi;

/**
 * Neutralise les couleurs oklch() que html2canvas ne sait pas parser.
 *
 * Stratégie : au lieu de *désactiver* les feuilles de style (ce qui
 * supprime aussi toutes les classes utilitaires Tailwind de layout,
 * taille, flexbox, etc.), on *clone* chaque stylesheet problématique
 * en remplaçant les valeurs oklch(...) par les valeurs computed (rgb)
 * des custom properties correspondantes.
 *
 * Étapes :
 * 1. Lire les valeurs computed de toutes les CSS custom properties
 *    déclarées sur :root (elles sont toujours en rgb/rgba).
 * 2. Pour chaque <style> contenant "oklch" :
 *    a. Remplacer oklch(...) par la valeur computed de la variable
 *       parente (ou un fallback transparent).
 *    b. Créer un <style> clone avec le CSS nettoyé.
 *    c. Désactiver l'original.
 * 3. Forcer les couleurs inline sur les éléments du CV (pour les
 *    propriétés résolues via var()).
 *
 * Retourne une fonction de restauration.
 */
function neutralizeOklchColors(root: HTMLElement): () => void {
  const rootComputed = getComputedStyle(document.documentElement);

  // ── 1. Build a map of CSS custom property name → computed rgb value ──
  const varMap = new Map<string, string>();

  // Collect variable names from all stylesheets that mention oklch
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const ownerEl = sheet.ownerNode as HTMLElement | null;
      if (!ownerEl) continue;
      let cssText = '';
      if (ownerEl instanceof HTMLStyleElement) {
        cssText = ownerEl.textContent || '';
      } else {
        try {
          cssText = Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
        } catch { /* cross-origin */ }
      }
      if (!cssText.includes('oklch')) continue;

      const matches = cssText.matchAll(/(--[\w-]+)\s*:\s*[^;]*oklch\([^)]*\)[^;]*/g);
      for (const m of matches) {
        const varName = m[1];
        if (!varMap.has(varName)) {
          const val = rootComputed.getPropertyValue(varName).trim();
          varMap.set(varName, val || 'transparent');
        }
      }
    } catch { /* skip */ }
  }

  // ── 2. Clone & patch stylesheets containing oklch ──
  const swapped: { original: CSSStyleSheet; clone: HTMLStyleElement }[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const ownerEl = sheet.ownerNode as HTMLElement | null;
      if (!ownerEl) continue;

      let cssText = '';
      if (ownerEl instanceof HTMLStyleElement) {
        cssText = ownerEl.textContent || '';
      } else {
        try {
          cssText = Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
        } catch { continue; }
      }

      if (!cssText.includes('oklch')) continue;

      // Replace each "varName: ...oklch(...)..." declaration with the
      // computed value.  Also replace any bare oklch() references that
      // aren't inside a variable declaration.
      let patched = cssText;

      // First: replace variable declarations containing oklch
      for (const [varName, rgb] of varMap) {
        // Replace the full declaration value for this variable
        const declRe = new RegExp(
          `(${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*)([^;]*oklch\\([^)]*\\)[^;]*)`,
          'gi',
        );
        patched = patched.replace(declRe, `$1${rgb}`);
      }

      // Second: replace any remaining oklch() that weren't in variable decls
      patched = patched.replace(OKLCH_RE, 'transparent');

      // Create the clone
      const clone = document.createElement('style');
      clone.setAttribute('data-pdf-export-clone', 'true');
      clone.textContent = patched;
      document.head.appendChild(clone);

      // Disable the original
      sheet.disabled = true;
      swapped.push({ original: sheet, clone });
    } catch { /* skip */ }
  }

  // ── 3. Force inline computed colors on CV elements ──
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

  // ── Cleanup ──
  return () => {
    for (const { el, cssProp, prev } of savedInline) {
      if (prev) {
        el.style.setProperty(cssProp, prev);
      } else {
        el.style.removeProperty(cssProp);
      }
    }
    for (const { original, clone } of swapped) {
      clone.remove();
      original.disabled = false;
    }
  };
}

/**
 * Exporte le CV en PDF via html2canvas + jsPDF.
 * Rasterise le contenu de #printable-cv en canvas haute résolution,
 * puis génère un PDF A4 sans marges supplémentaires.
 * Compatible Windows 11 (WebView2) et Ubuntu (WebKitGTK).
 */
export async function exportNativePdf(): Promise<boolean> {
  const cv = document.getElementById('printable-cv') as HTMLElement | null;
  if (!cv) return false;

  const originalStyle = cv.getAttribute('style') || '';
  const originalClass = cv.getAttribute('class') || '';

  // Clone stylesheets with oklch replaced, force inline colors
  const restoreColors = neutralizeOklchColors(cv);

  try {
    const a4WidthPx = 794;
    cv.style.width = `${a4WidthPx}px`;
    cv.style.maxWidth = `${a4WidthPx}px`;
    cv.style.minWidth = `${a4WidthPx}px`;
    cv.style.boxShadow = 'none';
    cv.style.margin = '0';

    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const canvas = await html2canvas(cv, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: a4WidthPx,
      windowWidth: a4WidthPx,
    });

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
    restoreColors();
    cv.setAttribute('style', originalStyle);
    cv.setAttribute('class', originalClass);
  }
}
