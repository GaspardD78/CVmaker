import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

// Dimensions A4 en mm
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

// Largeur A4 en px à 96 dpi
const A4_WIDTH_PX = 794;

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
 */
const _colorCtx = document.createElement('canvas').getContext('2d')!;
function toRgbString(raw: string): string {
  if (/^(rgb|#)/i.test(raw)) return raw;
  _colorCtx.fillStyle = '#000000';
  _colorCtx.fillStyle = raw;
  return _colorCtx.fillStyle;
}

/**
 * Force les couleurs computed en inline (format rgb/hex) sur chaque
 * élément du sous-arbre, pour compatibilité html2canvas.
 */
function forceInlineColors(root: HTMLElement): void {
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const el of elements) {
    const cs = getComputedStyle(el);
    for (const prop of COLOR_PROPS) {
      const val = (cs as any)[prop] as string;
      if (!val) continue;
      const cssProp = prop.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
      el.style.setProperty(cssProp, toRgbString(val), 'important');
    }
  }
}

/**
 * Copy all computed styles from the original tree to the cloned tree
 * as inline styles, so the clone renders identically outside its
 * original layout context.
 */
function copyComputedStyles(source: HTMLElement, target: HTMLElement): void {
  const sourceEls = [source, ...Array.from(source.querySelectorAll<HTMLElement>('*'))];
  const targetEls = [target, ...Array.from(target.querySelectorAll<HTMLElement>('*'))];

  for (let i = 0; i < sourceEls.length && i < targetEls.length; i++) {
    const cs = getComputedStyle(sourceEls[i]);
    // Copy critical layout properties that Tailwind classes define
    const props = [
      'display', 'position', 'float', 'clear',
      'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
      'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'border', 'borderWidth', 'borderStyle', 'borderColor', 'borderRadius',
      'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
      'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
      'lineHeight', 'letterSpacing', 'textAlign', 'textTransform', 'textDecoration',
      'color', 'backgroundColor', 'opacity',
      'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignSelf',
      'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'gap', 'rowGap', 'columnGap',
      'gridTemplateColumns', 'gridTemplateRows', 'gridColumn', 'gridRow',
      'overflow', 'overflowX', 'overflowY',
      'whiteSpace', 'wordBreak', 'wordWrap', 'overflowWrap',
      'listStyleType', 'listStylePosition',
      'verticalAlign', 'textIndent',
      'boxShadow', 'backgroundImage', 'backgroundSize', 'backgroundPosition',
      'backgroundRepeat', 'backgroundClip',
      'transform', 'transformOrigin',
      'zIndex',
    ];
    for (const prop of props) {
      const val = (cs as any)[prop];
      if (val && val !== '' && val !== 'initial' && val !== 'normal') {
        try {
          (targetEls[i].style as any)[prop] = val;
        } catch {
          // skip read-only shorthand properties
        }
      }
    }
    // Force overflow visible on all cloned elements to prevent clipping
    targetEls[i].style.overflow = 'visible';
    targetEls[i].style.overflowX = 'visible';
    targetEls[i].style.overflowY = 'visible';
  }
}

/**
 * Exporte le CV en PDF via html2canvas + jsPDF.
 *
 * Stratégie : cloner le nœud #printable-cv, le placer dans un conteneur
 * hors-écran sans contrainte de layout (pas de parent overflow:hidden,
 * pas de hauteur fixe), puis capturer le clone avec html2canvas.
 * Cela garantit que TOUT le contenu est visible et capturé,
 * indépendamment du layout scrollable de la page.
 */
export async function exportNativePdf(): Promise<boolean> {
  const cv = document.getElementById('printable-cv') as HTMLElement | null;
  if (!cv) return false;

  // ── 1. Clone the CV DOM node ──
  const clone = cv.cloneNode(true) as HTMLElement;
  // Change ID to avoid selector conflicts
  clone.id = 'printable-cv-export';

  // Update CSS selectors inside the cloned <style> tag
  const styleTags = clone.querySelectorAll('style');
  styleTags.forEach(tag => {
    tag.textContent = (tag.textContent || '').replace(/#printable-cv\b/g, '#printable-cv-export');
  });

  // ── 2. Place clone in an unconstrained off-screen container ──
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: -9999px',
    `width: ${A4_WIDTH_PX}px`,
    'height: auto',
    'overflow: visible',
    'z-index: -9999',
    'background: white',
    'pointer-events: none',
  ].join('; ');
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    // ── 3. Copy computed styles from original to clone ──
    // This is necessary because the clone is removed from its original
    // Tailwind/CSS context — class-based styles may not fully apply
    // when the element tree is detached from its original ancestors.
    copyComputedStyles(cv, clone);

    // ── 4. Force all dimensions on clone root ──
    clone.style.setProperty('width', `${A4_WIDTH_PX}px`, 'important');
    clone.style.setProperty('max-width', `${A4_WIDTH_PX}px`, 'important');
    clone.style.setProperty('min-width', `${A4_WIDTH_PX}px`, 'important');
    clone.style.setProperty('height', 'auto', 'important');
    clone.style.setProperty('max-height', 'none', 'important');
    clone.style.setProperty('overflow', 'visible', 'important');
    clone.style.setProperty('box-shadow', 'none', 'important');
    clone.style.setProperty('margin', '0', 'important');

    // ── 5. Convert oklch/lab/lch → rgb/hex on the clone ──
    forceInlineColors(clone);

    // ── 6. Wait for fonts + layout stabilisation ──
    await document.fonts.ready;
    await new Promise<void>(r => setTimeout(r, 500));

    // ── 7. Capture the clone with html2canvas ──
    const fullHeight = clone.scrollHeight;
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: A4_WIDTH_PX,
      height: fullHeight,
      windowWidth: A4_WIDTH_PX,
      windowHeight: fullHeight,
      scrollX: 0,
      scrollY: 0,
    });

    // ── 8. Generate PDF with multi-page support ──
    const imgWidth = A4_WIDTH_MM;
    const imgHeight = (canvas.height * A4_WIDTH_MM) / canvas.width;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const imgData = canvas.toDataURL('image/png');

    if (imgHeight > A4_HEIGHT_MM) {
      const pageCount = Math.ceil(imgHeight / A4_HEIGHT_MM);
      for (let page = 0; page < pageCount; page++) {
        if (page > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -(page * A4_HEIGHT_MM), imgWidth, imgHeight);
      }
    } else {
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    }

    // ── 9. Save file via Tauri dialog ──
    const pdfBlob = pdf.output('arraybuffer');
    const filePath = await save({
      defaultPath: 'cv_export.pdf',
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    if (!filePath) return false;

    await writeFile(filePath, new Uint8Array(pdfBlob));
    return true;
  } finally {
    // ── 10. Cleanup — remove the off-screen clone ──
    document.body.removeChild(wrapper);
  }
}
