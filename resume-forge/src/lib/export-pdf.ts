import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

// Dimensions A4 en mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Resolve all oklch() / color-mix() / CSS variable colors that html2canvas
 * cannot parse.  We walk every element inside the subtree, read the
 * *computed* style for the colour-related properties, and set them as
 * inline styles so html2canvas sees plain rgb()/rgba() values only.
 *
 * Returns a cleanup function that restores the original inline styles.
 */
function resolveModernColors(root: HTMLElement): () => void {
  const COLOR_PROPS = [
    'color', 'backgroundColor', 'borderColor',
    'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
    'outlineColor', 'textDecorationColor',
  ] as const;

  const saved: { el: HTMLElement; prop: string; prev: string }[] = [];

  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const el of elements) {
    const computed = getComputedStyle(el);
    for (const prop of COLOR_PROPS) {
      const val = computed[prop as any] as string;
      if (!val) continue;
      // Save whatever was previously on the inline style (may be '')
      saved.push({ el, prop, prev: el.style.getPropertyValue(propToCss(prop)) });
      // Overwrite with the computed (always rgb/rgba) value
      (el.style as any)[prop] = val;
    }
  }

  return () => {
    for (const { el, prop, prev } of saved) {
      if (prev) {
        (el.style as any)[prop] = prev;
      } else {
        el.style.removeProperty(propToCss(prop));
      }
    }
  };
}

/** camelCase → kebab-case */
function propToCss(prop: string): string {
  return prop.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
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

  // Resolve oklch/color-mix/var() colors to plain rgb() for html2canvas
  const restoreColors = resolveModernColors(cv);

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
