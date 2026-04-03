/**
 * Exporte le CV en PDF — stratégie « PDF sandwich » (modèle OCR) :
 *
 *  1. Couche texte invisible : les nœuds texte du DOM sont ajoutés en premier
 *     dans le flux PDF (couleur quasi-blanche → visuellement absente).
 *     ATS et copier-coller fonctionnent car le texte est bien dans le flux.
 *  2. Image opaque par-dessus : html2canvas capture le DOM pixel-perfect
 *     (graphiques, couleurs oklch, fonds) et est déposée sur le texte.
 *     L'image couvre tout visuellement ; les visionneuses PDF permettent
 *     quand même la sélection du texte sous-jacent (comme les scans OCR).
 *  3. Annotations de liens : les <a href> deviennent des zones cliquables PDF.
 *
 * Ce modèle est standard et fiable : pas de mode Tr=3, pas d'API interne
 * jsPDF, compatible avec tous les visionneuses et ATS.
 *
 * Différences par plateforme :
 *  - Android : scale 2×, JPEG 92 % (bande passante réduite).
 *  - Desktop  : scale 3×, PNG (netteté maximale).
 *
 * Sauvegarde via plugin-dialog + plugin-fs.
 */

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

// ─── Suppression temporaire du clipping CSS des ancêtres ─────────────────────
//
// Le panneau droit a `overflow-auto h-full`, ce qui crée un contexte de
// découpe CSS. html2canvas respecte ce clip et ne capture que la portion
// visible à l'écran — le contenu scrollé (expériences, formations…) est absent.
// On neutralise temporairement tous les overflow contraignants jusqu'à <body>,
// le temps de la capture, puis on restaure l'état d'origine.

function disableAncestorOverflow(el: HTMLElement): () => void {
  const snapshots: Array<{ node: HTMLElement; prev: string }> = [];

  let cur = el.parentElement;
  while (cur && cur !== document.body) {
    const cs = getComputedStyle(cur);
    const hasClip =
      ['auto', 'scroll', 'hidden'].includes(cs.overflowX) ||
      ['auto', 'scroll', 'hidden'].includes(cs.overflowY);
    if (hasClip) {
      snapshots.push({ node: cur, prev: cur.style.cssText });
      cur.style.setProperty('overflow', 'visible', 'important');
    }
    cur = cur.parentElement;
  }

  return () => {
    for (const { node, prev } of snapshots) {
      node.style.cssText = prev;
    }
  };
}

// ─── Résolution oklch → rgb dans le clone html2canvas ────────────────────────

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

// ─── Couche texte (déposée AVANT l'image, couverte visuellement par elle) ────

function addTextLayer(
  pdf: import('jspdf').jsPDF,
  cvNode: HTMLElement,
  pageW: number,
  pageH: number,
): void {
  const cvRect = cvNode.getBoundingClientRect();
  const pxToMm = pageW / cvNode.offsetWidth;

  // Couleur quasi-blanche : visuellement absente sur fond blanc, et couverte
  // de toute façon par l'image opaque déposée ensuite.
  pdf.setTextColor(240, 240, 240);

  const walker = document.createTreeWalker(cvNode, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  let currentPdfPage = 1;

  while ((node = walker.nextNode())) {
    const text = (node.textContent ?? '').trim();
    if (!text) continue;

    const parent = node.parentElement;
    if (!parent) continue;

    // Exclure les éléments SVG (icônes) — leur contenu textuel n'est pas
    // pertinent pour l'ATS et causerait des artefacts de position.
    if (parent.closest('svg')) continue;

    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    const range = document.createRange();
    range.selectNodeContents(node);
    const lineRects = Array.from(range.getClientRects());
    if (!lineRects.length) continue;

    // On utilise le premier rect (première ligne du nœud texte).
    const r = lineRects[0];
    if (r.width < 1 || r.height < 1) continue;

    const xMm = (r.left - cvRect.left) * pxToMm;
    // rect.bottom = bas de la boîte de texte ≈ ligne de base + descendantes
    const yMm = (r.bottom - cvRect.top) * pxToMm;

    if (xMm < 0 || xMm > pageW || yMm < 0) continue;

    // Page cible et position relative sur cette page
    const targetPage = Math.floor(yMm / pageH) + 1;
    const yOnPage = yMm - (targetPage - 1) * pageH;

    // Marge de sécurité de 2 mm en bas de chaque page pour éviter
    // qu'un texte trop proche du bord ne génère une page supplémentaire.
    if (yOnPage < 1 || yOnPage > pageH - 2) continue;
    if (targetPage > pdf.getNumberOfPages()) continue;

    if (targetPage !== currentPdfPage) {
      pdf.setPage(targetPage);
      currentPdfPage = targetPage;
    }

    const fontSizePt = Math.max(parseFloat(style.fontSize) * 0.75, 4);
    pdf.setFontSize(fontSizePt);

    try {
      pdf.text(text, xMm, yOnPage);
    } catch {
      // Caractère non supporté par la police par défaut — ignorer silencieusement
    }
  }

  // Remettre la page 1 et la couleur noire pour la suite
  pdf.setPage(1);
  pdf.setTextColor(0, 0, 0);
}

// ─── Annotations de liens cliquables ─────────────────────────────────────────

function addLinksLayer(
  pdf: import('jspdf').jsPDF,
  cvNode: HTMLElement,
  pageW: number,
  pageH: number,
): void {
  const cvRect = cvNode.getBoundingClientRect();
  const pxToMm = pageW / cvNode.offsetWidth;

  const anchors = cvNode.querySelectorAll<HTMLAnchorElement>('a[href]');
  for (const anchor of anchors) {
    const href = anchor.href;
    if (!href || href.startsWith('javascript:') || href.startsWith('blob:')) continue;

    const rect = anchor.getBoundingClientRect();
    const xMm = (rect.left - cvRect.left) * pxToMm;
    const yMm = (rect.top - cvRect.top) * pxToMm;
    const wMm = rect.width * pxToMm;
    const hMm = rect.height * pxToMm;

    if (wMm < 1 || hMm < 1 || xMm < 0 || yMm < 0 || yMm > pageH) continue;

    pdf.link(xMm, yMm, wMm, hMm, { url: href });
  }
}

// ─── Placement de l'image (gestion 1 page / multi-pages) ─────────────────────

function addImageLayer(
  pdf: import('jspdf').jsPDF,
  imgData: string,
  format: 'JPEG' | 'PNG',
  pageW: number,
  pageH: number,
  imgHeightMm: number,
): void {
  if (imgHeightMm <= pageH) {
    // Contenu inférieur à 1 page A4 : placement direct
    pdf.addImage(imgData, format, 0, 0, pageW, imgHeightMm);
  } else if (imgHeightMm <= pageH * 1.05) {
    // Léger dépassement (≤ 5 % ≈ 15 mm) : on force sur 1 page.
    // Arrive quand l'élément a un min-height ou un padding qui pousse
    // quelques millimètres au-delà de 297 mm alors que le contenu réel
    // tient sur une page.
    pdf.addImage(imgData, format, 0, 0, pageW, pageH);
  } else {
    // Contenu réellement multi-pages
    const numPages = Math.ceil(imgHeightMm / pageH);
    for (let i = 0; i < numPages; i++) {
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, format, 0, -(i * pageH), pageW, imgHeightMm);
    }
  }
}

// ─── Chemin Android ───────────────────────────────────────────────────────────

async function exportPdfAndroid(): Promise<boolean> {
  const cvNode = document.getElementById('printable-cv');
  if (!cvNode) {
    console.error('exportPdfAndroid: #printable-cv introuvable');
    return false;
  }

  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  // Neutraliser le clipping CSS des conteneurs parents avant la capture
  const restoreOverflow = disableAncestorOverflow(cvNode);
  const canvas = await html2canvas(cvNode, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: cvNode.scrollWidth,
    windowHeight: cvNode.scrollHeight,
    onclone: resolveOklchColors(cvNode),
  });
  restoreOverflow();

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgHeightMm = (canvas.height / canvas.width) * pageW;

  // 1. Texte en dessous
  addTextLayer(pdf, cvNode, pageW, pageH);

  // 2. Image par-dessus (couvre le texte visuellement)
  addImageLayer(pdf, canvas.toDataURL('image/jpeg', 0.92), 'JPEG', pageW, pageH, imgHeightMm);

  // 3. Liens cliquables
  addLinksLayer(pdf, cvNode, pageW, pageH);

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

// ─── Chemin Desktop ───────────────────────────────────────────────────────────

async function exportPdfDesktop(): Promise<boolean> {
  const cvNode = document.getElementById('printable-cv');
  if (!cvNode) {
    console.error('exportPdfDesktop: #printable-cv introuvable');
    return false;
  }

  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  // Neutraliser le clipping CSS des conteneurs parents avant la capture
  const restoreOverflow = disableAncestorOverflow(cvNode);
  const canvas = await html2canvas(cvNode, {
    scale: 3,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: cvNode.scrollWidth,
    windowHeight: cvNode.scrollHeight,
    onclone: resolveOklchColors(cvNode),
  });
  restoreOverflow();

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgHeightMm = (canvas.height / canvas.width) * pageW;

  // 1. Texte en dessous
  addTextLayer(pdf, cvNode, pageW, pageH);

  // 2. Image par-dessus (couvre le texte visuellement)
  addImageLayer(pdf, canvas.toDataURL('image/png'), 'PNG', pageW, pageH, imgHeightMm);

  // 3. Liens cliquables
  addLinksLayer(pdf, cvNode, pageW, pageH);

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
