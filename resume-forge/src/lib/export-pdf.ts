/**
 * Exporte le CV en PDF.
 *
 * Stratégie commune : html2canvas capture le DOM tel qu'il est affiché à
 * l'écran, puis jsPDF génère un PDF A4 à partir de cette image — sans boîte
 * de dialogue d'impression, ni re-layout navigateur.
 *
 * Différences par plateforme :
 *  - Android : scale 2×, image JPEG 92 % (bande passante réduite).
 *  - Desktop  : scale 3×, image PNG (meilleure netteté du texte).
 *
 * Le fichier est enregistré via le dialog SAF (plugin-dialog) + plugin-fs.
 * Le plugin-opener est évité sur Android : sa v2.5.3 a un bug de
 * sérialisation sur le bridge Kotlin.
 */

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

// ─── Chemin Android : html2canvas + jsPDF → dialog SAF ──────────────────────

async function exportPdfAndroid(): Promise<boolean> {
  const cvNode = document.getElementById('printable-cv');
  if (!cvNode) {
    console.error('exportPdfAndroid: #printable-cv introuvable');
    return false;
  }

  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  // Capture avec résolution oklch→rgb dans le clone
  const canvas = await html2canvas(cvNode, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: cvNode.scrollWidth,
    onclone: (_clonedDoc: Document, clonedEl: HTMLElement) => {
      const origAll = cvNode.querySelectorAll('*');
      const clonedAll = clonedEl.querySelectorAll('*');

      const resolveColors = (orig: Element, clone: HTMLElement) => {
        const cs = getComputedStyle(orig);
        clone.style.color = cs.color;
        clone.style.backgroundColor = cs.backgroundColor;
        clone.style.borderTopColor = cs.borderTopColor;
        clone.style.borderRightColor = cs.borderRightColor;
        clone.style.borderBottomColor = cs.borderBottomColor;
        clone.style.borderLeftColor = cs.borderLeftColor;
      };

      resolveColors(cvNode, clonedEl);
      origAll.forEach((orig, i) => {
        const clone = clonedAll[i] as HTMLElement | undefined;
        if (clone?.style) resolveColors(orig, clone);
      });
    },
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();  // 210
  const pageH = pdf.internal.pageSize.getHeight(); // 297
  const imgHeightMm = (canvas.height / canvas.width) * pageW;

  if (imgHeightMm <= pageH) {
    pdf.addImage(imgData, 'JPEG', 0, 0, pageW, imgHeightMm);
  } else {
    const numPages = Math.ceil(imgHeightMm / pageH);
    for (let i = 0; i < numPages; i++) {
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -(i * pageH), pageW, imgHeightMm);
    }
  }

  const pdfData = new Uint8Array(pdf.output('arraybuffer'));

  // Même pattern que l'export DOCX : dialog SAF « Enregistrer sous » +
  // writeFile.  Évite le plugin-opener dont le bridge Kotlin est cassé.
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

// ─── Chemin Desktop : html2canvas + jsPDF → dialog « Enregistrer sous » ──────

async function exportPdfDesktop(): Promise<boolean> {
  const cvNode = document.getElementById('printable-cv');
  if (!cvNode) {
    console.error('exportPdfDesktop: #printable-cv introuvable');
    return false;
  }

  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');

  // Capture haute résolution avec conversion oklch→rgb
  const canvas = await html2canvas(cvNode, {
    scale: 3,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: cvNode.scrollWidth,
    onclone: (_clonedDoc: Document, clonedEl: HTMLElement) => {
      const origAll = cvNode.querySelectorAll('*');
      const clonedAll = clonedEl.querySelectorAll('*');

      const resolveColors = (orig: Element, clone: HTMLElement) => {
        const cs = getComputedStyle(orig);
        clone.style.color = cs.color;
        clone.style.backgroundColor = cs.backgroundColor;
        clone.style.borderTopColor = cs.borderTopColor;
        clone.style.borderRightColor = cs.borderRightColor;
        clone.style.borderBottomColor = cs.borderBottomColor;
        clone.style.borderLeftColor = cs.borderLeftColor;
      };

      resolveColors(cvNode, clonedEl);
      origAll.forEach((orig, i) => {
        const clone = clonedAll[i] as HTMLElement | undefined;
        if (clone?.style) resolveColors(orig, clone);
      });
    },
  });

  // PNG pour une meilleure netteté du texte sur desktop
  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();  // 210
  const pageH = pdf.internal.pageSize.getHeight(); // 297
  const imgHeightMm = (canvas.height / canvas.width) * pageW;

  if (imgHeightMm <= pageH) {
    pdf.addImage(imgData, 'PNG', 0, 0, pageW, imgHeightMm);
  } else {
    const numPages = Math.ceil(imgHeightMm / pageH);
    for (let i = 0; i < numPages; i++) {
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, -(i * pageH), pageW, imgHeightMm);
    }
  }

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
