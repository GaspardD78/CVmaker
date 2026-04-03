/**
 * Exporte le CV en PDF — stratégie « PDF sandwich » :
 *
 *  1. html2canvas capture le DOM pixel-perfect (graphiques, couleurs oklch,
 *     fonds colorés) → image PNG intégrée comme couche visuelle.
 *  2. Une couche texte invisible (mode PDF Tr=3, spec §9.3.1) est superposée
 *     aux positions exactes des nœuds texte → texte sélectionnable, copiable
 *     et lisible par les ATS.
 *  3. Les balises <a href> deviennent des annotations de lien PDF cliquables.
 *
 * Résultat : rendu identique à la vue logiciel, 100 % automatique (aucune
 * boîte de dialogue d'impression), ATS-compatible, liens actifs.
 *
 * Différences par plateforme :
 *  - Android : scale 2×, image JPEG 92 % (plus léger pour le bridge Kotlin).
 *  - Desktop  : scale 3×, image PNG (netteté maximale).
 *
 * Sauvegarde via plugin-dialog + plugin-fs (évite plugin-opener dont le
 * bridge Kotlin v2.5.3 a un bug de sérialisation).
 */

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

// ─── Résolution des couleurs oklch → rgb dans le clone html2canvas ───────────

function resolveOklchColors(cvNode: HTMLElement) {
  return (_clonedDoc: Document, clonedEl: HTMLElement) => {
    const origAll = cvNode.querySelectorAll('*');
    const clonedAll = clonedEl.querySelectorAll('*');
    const resolve = (orig: Element, clone: HTMLElement) => {
      const cs = getComputedStyle(orig);
      clone.style.color = cs.color;
      clone.style.backgroundColor = cs.backgroundColor;
      clone.style.borderTopColor = cs.borderTopColor;
      clone.style.borderRightColor = cs.borderRightColor;
      clone.style.borderBottomColor = cs.borderBottomColor;
      clone.style.borderLeftColor = cs.borderLeftColor;
    };
    resolve(cvNode, clonedEl);
    origAll.forEach((orig, i) => {
      const clone = clonedAll[i] as HTMLElement | undefined;
      if (clone?.style) resolve(orig, clone);
    });
  };
}

// ─── Couche texte invisible + annotations de liens ───────────────────────────

function addTextAndLinksLayer(
  pdf: import('jspdf').jsPDF,
  cvNode: HTMLElement,
  pageW: number,
  pageH: number,
): void {
  const cvRect = cvNode.getBoundingClientRect();
  const pxToMm = pageW / cvNode.offsetWidth;

  // Mode texte invisible : Tr=3 dans la spec PDF (ni rempli, ni contouré).
  // Le texte est présent dans le flux de contenu et donc lisible par les ATS,
  // mais n'est pas rendu visuellement — la couche image reste seule visible.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdf as any).internal.write('3 Tr');

  const walker = document.createTreeWalker(cvNode, NodeFilter.SHOW_TEXT);
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const text = (node.textContent ?? '').trim();
    if (!text) continue;

    const parent = node.parentElement;
    if (!parent) continue;

    // getClientRects() donne une rect par ligne visuelle du nœud texte
    const range = document.createRange();
    range.selectNodeContents(node);
    const lineRects = Array.from(range.getClientRects());
    if (!lineRects.length) continue;

    // Taille de police : px → pt (1 px CSS = 0,75 pt à 96 dpi)
    const fontSizePt = Math.max(parseFloat(getComputedStyle(parent).fontSize) * 0.75, 4);
    pdf.setFontSize(fontSizePt);

    // Pour les nœuds multi-lignes, on dépose le texte à la position de la
    // première ligne seulement (l'ATS lit le contenu, pas la position).
    const rect = lineRects[0];
    if (rect.width < 1 || rect.height < 1) continue;

    const xMm = (rect.left - cvRect.left) * pxToMm;
    const yMm = (rect.bottom - cvRect.top) * pxToMm;

    // Ignorer les nœuds hors page
    const pageIndex = Math.floor(yMm / pageH);
    const yOnPage = yMm - pageIndex * pageH;
    if (xMm < 0 || xMm > pageW || yOnPage < 0) continue;

    if (pageIndex > 0) {
      // Aller à la bonne page si le CV est multi-page
      if (pageIndex + 1 > pdf.getNumberOfPages()) continue;
      pdf.setPage(pageIndex + 1);
    }

    try {
      pdf.text(text, xMm, yOnPage);
    } catch {
      // Caractère non supporté par la police par défaut — ignorer
    }
  }

  // Remettre le mode texte normal avant les annotations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdf as any).internal.write('0 Tr');
  pdf.setPage(1);

  // Annotations de liens cliquables
  const anchors = cvNode.querySelectorAll<HTMLAnchorElement>('a[href]');
  for (const anchor of anchors) {
    const href = anchor.href;
    if (!href || href.startsWith('javascript:') || href.startsWith('blob:')) continue;

    const rect = anchor.getBoundingClientRect();
    const xMm = (rect.left - cvRect.left) * pxToMm;
    const yMm = (rect.top - cvRect.top) * pxToMm;
    const wMm = rect.width * pxToMm;
    const hMm = rect.height * pxToMm;
    if (wMm < 1 || hMm < 1) continue;

    const pageIndex = Math.floor(yMm / pageH);
    const yOnPage = yMm - pageIndex * pageH;
    if (pageIndex > 0 && pageIndex + 1 <= pdf.getNumberOfPages()) {
      pdf.setPage(pageIndex + 1);
    }

    pdf.link(xMm, yOnPage, wMm, hMm, { url: href });
    pdf.setPage(1);
  }
}

// ─── Chemin Android : html2canvas JPEG + couche texte/liens ─────────────────

async function exportPdfAndroid(): Promise<boolean> {
  const cvNode = document.getElementById('printable-cv');
  if (!cvNode) {
    console.error('exportPdfAndroid: #printable-cv introuvable');
    return false;
  }

  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  const canvas = await html2canvas(cvNode, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: cvNode.scrollWidth,
    onclone: resolveOklchColors(cvNode),
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgHeightMm = (canvas.height / canvas.width) * pageW;

  if (imgHeightMm <= pageH) {
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, imgHeightMm);
  } else {
    const numPages = Math.ceil(imgHeightMm / pageH);
    for (let i = 0; i < numPages; i++) {
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, -(i * pageH), pageW, imgHeightMm);
    }
  }

  addTextAndLinksLayer(pdf, cvNode, pageW, pageH);

  const pdfData = new Uint8Array(pdf.output('arraybuffer'));
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeFile } = await import('@tauri-apps/plugin-fs');

  const filePath = await save({
    defaultPath: 'cv_export.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!filePath) return false;

  await writeFile(filePath, pdfData);
  return true;
}

// ─── Chemin Desktop : html2canvas PNG + couche texte/liens ───────────────────

async function exportPdfDesktop(): Promise<boolean> {
  const cvNode = document.getElementById('printable-cv');
  if (!cvNode) {
    console.error('exportPdfDesktop: #printable-cv introuvable');
    return false;
  }

  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  const canvas = await html2canvas(cvNode, {
    scale: 3,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: cvNode.scrollWidth,
    onclone: resolveOklchColors(cvNode),
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgHeightMm = (canvas.height / canvas.width) * pageW;

  if (imgHeightMm <= pageH) {
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, imgHeightMm);
  } else {
    const numPages = Math.ceil(imgHeightMm / pageH);
    for (let i = 0; i < numPages; i++) {
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, -(i * pageH), pageW, imgHeightMm);
    }
  }

  addTextAndLinksLayer(pdf, cvNode, pageW, pageH);

  const pdfData = new Uint8Array(pdf.output('arraybuffer'));
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeFile } = await import('@tauri-apps/plugin-fs');

  const filePath = await save({
    defaultPath: 'cv_export.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!filePath) return false;

  await writeFile(filePath, pdfData);
  return true;
}

// ─── Point d'entrée public ───────────────────────────────────────────────────

export async function exportNativePdf(): Promise<boolean> {
  return isAndroid() ? exportPdfAndroid() : exportPdfDesktop();
}
