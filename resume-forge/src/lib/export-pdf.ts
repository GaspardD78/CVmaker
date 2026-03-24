/**
 * Exporte le CV en PDF.
 *
 * Stratégie hybride selon la plateforme :
 *  - Android (Tauri WebView) : window.print() natif.
 *    Le CSS @media print dans App.css positionne #printable-cv à 210 mm
 *    et masque tout le reste. Le dialogue d'impression Android offre
 *    « Enregistrer en PDF ».
 *  - Desktop (Windows/macOS/Linux) : page HTML autonome ouverte dans une
 *    nouvelle fenêtre et impression native (qualité vectorielle).
 */

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

// ─── Chemin Android : window.print() natif ───────────────────────────────────

function exportPdfAndroid(): boolean {
  const cvNode = document.getElementById('printable-cv');
  if (!cvNode) {
    console.error('exportPdfAndroid: #printable-cv introuvable');
    return false;
  }

  // Le CSS @media print (App.css) gère :
  //   - body * { visibility: hidden }
  //   - #printable-cv, #printable-cv * { visibility: visible }
  //   - #printable-cv { position: fixed; width: 210mm; ... }
  // Le dialogue d'impression Android inclut « Enregistrer en PDF ».
  window.print();
  return true;
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
