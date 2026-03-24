/**
 * Exporte le CV en PDF.
 *
 * Stratégie hybride selon la plateforme :
 *  - Android (Tauri WebView) : html2canvas → jsPDF → save via plugin-dialog/plugin-fs
 *    window.open/window.print() étant bloqués dans la WebView Android.
 *  - Desktop (Windows/macOS/Linux) : page HTML autonome ouverte dans une nouvelle
 *    fenêtre et impression native (qualité vectorielle, gestion @page A4).
 */

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

// ─── Chemin Android : html2canvas + jsPDF ────────────────────────────────────

async function exportPdfAndroid(): Promise<boolean> {
  const cvNode = document.getElementById('printable-cv');
  if (!cvNode) {
    console.error('exportPdfAndroid: #printable-cv introuvable');
    return false;
  }

  try {
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');

    // Capture haute résolution du CV rendu (scale:2 ≈ 192 dpi)
    const canvas = await html2canvas(cvNode, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();  // 210 mm
    const pageH = pdf.internal.pageSize.getHeight(); // 297 mm

    // Hauteur de l'image en mm (proportionnelle à la largeur A4)
    const imgHeightMm = (canvas.height / canvas.width) * pageW;

    if (imgHeightMm <= pageH) {
      // CV tient sur une seule page
      pdf.addImage(imgData, 'JPEG', 0, 0, pageW, imgHeightMm);
    } else {
      // CV multi-pages : on découpe l'image par tranches de pageH
      const numPages = Math.ceil(imgHeightMm / pageH);
      for (let i = 0; i < numPages; i++) {
        if (i > 0) pdf.addPage();
        // Décaler l'image vers le haut pour afficher la tranche correcte
        pdf.addImage(imgData, 'JPEG', 0, -(i * pageH), pageW, imgHeightMm);
      }
    }

    const pdfBytes = pdf.output('arraybuffer');

    // Sauvegarder via les plugins Tauri (Storage Access Framework sur Android)
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');

    const savePath = await save({
      defaultPath: 'cv.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (savePath) {
      await writeFile(savePath, new Uint8Array(pdfBytes));
      return true;
    }
    return false;
  } catch (e) {
    console.error('exportPdfAndroid: échec', e);
    return false;
  }
}

// ─── Chemin Desktop : HTML autonome + window.print() ─────────────────────────

async function exportPdfDesktop(): Promise<boolean> {
  const cvNode = document.getElementById('printable-cv');
  if (!cvNode) {
    console.error('exportPdfDesktop: #printable-cv introuvable');
    return false;
  }

  let cvHtml = cvNode.outerHTML;

  cvHtml = cvHtml.replace(
    /style="margin:\s*-40px\s*-40px[^"]*"/,
    'style="margin: -28px -32px 0.75rem; padding: 28px 32px; background-color: rgb(38, 162, 105);"'
  );

  cvHtml = cvHtml
    .replace(/@media\s+print\s*\{\s*#printable-cv\s*\{[^}]+\}\s*\}/g, '')
    .replace(/@media\s+print\s*\{\s*#printable-cv\s+\.cv-header-block\s*\{[^}]+\}\s*\}/g, '');

  let collectedCss = '';
  try {
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        Array.from(sheet.cssRules).forEach(rule => {
          if (rule instanceof CSSMediaRule) {
            const mq = rule.conditionText || rule.media?.mediaText || '';
            if (mq.includes('print')) return;
          }
          if (rule instanceof CSSPageRule) return;
          collectedCss += rule.cssText + '\n';
        });
      } catch {
        // CORS sur sheets externes — ignorer
      }
    });
  } catch { /* ignorer */ }

  const doc = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    ${collectedCss}
    @page { size: A4 portrait; margin: 0mm; }
    html, body {
      margin: 0 !important; padding: 0 !important;
      width: 210mm !important; height: auto !important;
      overflow: visible !important; background: white !important;
    }
    #printable-cv {
      position: static !important; width: 210mm !important;
      max-width: none !important; margin: 0 !important;
      padding: 28px 32px !important; zoom: 1 !important; transform: none !important;
    }
    #printable-cv .cv-header-block {
      margin: -28px -32px 0.75rem !important; padding: 28px 32px !important;
    }
    #printable-cv h3 { break-after: avoid; page-break-after: avoid; }
    #printable-cv .cv-entry { break-inside: avoid; page-break-inside: avoid; }
  </style>
</head>
<body>
  ${cvHtml}
  <script>
    document.fonts.ready.then(function() {
      setTimeout(function() {
        window.print();
        setTimeout(function() { window.close(); }, 1000);
      }, 800);
    });
  </script>
</body>
</html>`;

  const blob = new Blob([doc], { type: 'text/html; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const printWin = window.open(url, '_blank', 'width=900,height=700');

  if (!printWin) {
    // Fallback si popup bloqué par Tauri CSP (desktop)
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const { openPath } = await import('@tauri-apps/plugin-opener');

      const tempPath = await save({
        defaultPath: 'cv_print.html',
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });
      if (tempPath) {
        await writeTextFile(tempPath, doc);
        await openPath(tempPath);
      }
    } catch (e) {
      console.error('Export PDF fallback échoué:', e);
    }
  }

  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}

// ─── Point d'entrée public ───────────────────────────────────────────────────

export async function exportNativePdf(): Promise<boolean> {
  return isAndroid() ? exportPdfAndroid() : exportPdfDesktop();
}
