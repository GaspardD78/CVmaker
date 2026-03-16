import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

// Dimensions A4 en mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** CSS colour properties we need to resolve to rgb() for html2canvas. */
const COLOR_PROPS = [
  'color', 'backgroundColor', 'borderColor',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'outlineColor', 'textDecorationColor', 'fill',
] as const;

/**
 * Exporte le CV en PDF via html2canvas + jsPDF.
 *
 * html2canvas ne sait pas parser oklch() — son parser CSS interne
 * plante.  Plutôt que de modifier le DOM vivant (ce qui casse l'UI
 * visible), on utilise le callback `onclone` de html2canvas pour
 * patcher uniquement le document *cloné* :
 *
 * 1. Avant l'appel : on pré-calcule les couleurs computed (rgb) de
 *    chaque élément du CV depuis le DOM vivant.
 * 2. Dans onclone : on applique ces couleurs en inline sur les
 *    éléments clonés, puis on supprime les <style> contenant oklch.
 *
 * Le DOM original n'est jamais modifié (sauf la largeur A4 du CV).
 */
export async function exportNativePdf(): Promise<boolean> {
  const cv = document.getElementById('printable-cv') as HTMLElement | null;
  if (!cv) return false;

  // ── 1. Pre-compute resolved (rgb) colours from the live DOM ──
  // The browser resolves oklch → rgb internally; getComputedStyle
  // always returns rgb()/rgba().
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

  // Also pre-compute all CSS custom properties from :root
  // (they may hold oklch values that Tailwind utilities reference via var())
  const rootCs = getComputedStyle(document.documentElement);
  const customPropOverrides: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const ownerEl = sheet.ownerNode as HTMLElement | null;
      if (!ownerEl) continue;
      let text = '';
      if (ownerEl instanceof HTMLStyleElement) {
        text = ownerEl.textContent || '';
      } else {
        try { text = Array.from(sheet.cssRules).map(r => r.cssText).join('\n'); }
        catch { continue; }
      }
      if (!text.includes('oklch')) continue;
      for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) {
        const v = rootCs.getPropertyValue(m[1]).trim();
        if (v) customPropOverrides.push(`  ${m[1]}: ${v};`);
      }
    } catch { /* skip */ }
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
    // ── 3. Rasterise via html2canvas with onclone patching ──
    const canvas = await html2canvas(cv, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: a4WidthPx,
      windowWidth: a4WidthPx,
      onclone: (clonedDoc: Document, clonedCv: HTMLElement) => {
        // 3a. Inject a <style> that overrides all CSS custom properties
        //     with their computed (rgb) values — so var(--xxx) in the
        //     cloned stylesheets resolves to rgb, not oklch.
        if (customPropOverrides.length > 0) {
          const overrideStyle = clonedDoc.createElement('style');
          overrideStyle.textContent = `:root {\n${customPropOverrides.join('\n')}\n}`;
          clonedDoc.head.appendChild(overrideStyle);
        }

        // 3b. Remove any <style> element whose content contains oklch —
        //     html2canvas's CSS parser crashes on it.  The override
        //     <style> above + inline styles below provide all the
        //     colour information html2canvas needs.
        for (const style of Array.from(clonedDoc.querySelectorAll('style'))) {
          if (style.textContent?.includes('oklch')) {
            style.remove();
          }
        }
        // Also remove <link> stylesheets that might reference oklch
        for (const link of Array.from(clonedDoc.querySelectorAll('link[rel="stylesheet"]'))) {
          // We can't read cross-origin link content, but Tailwind is
          // typically inlined as <style> in Vite builds.  Remove links
          // only if we know they're problematic (same-origin check).
          try {
            const href = (link as HTMLLinkElement).href;
            if (href && href.startsWith(location.origin)) {
              link.remove();
            }
          } catch { /* skip */ }
        }

        // 3c. Apply pre-computed inline colours on every cloned element.
        //     This guarantees html2canvas sees rgb() values, not var()
        //     or oklch().
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
    // ── 5. Restore only the sizing on the live element ──
    if (originalStyle) {
      cv.setAttribute('style', originalStyle);
    } else {
      cv.removeAttribute('style');
    }
  }
}
