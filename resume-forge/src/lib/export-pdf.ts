/**
 * Exporte le CV en PDF via une page HTML autonome.
 *
 * Stratégie : capturer le HTML déjà rendu par React (#printable-cv),
 * collecter les styles CSS nécessaires (en excluant @media print de App.css),
 * et ouvrir un document HTML complet et autonome dans une nouvelle fenêtre.
 *
 * Avantages :
 * - Isolation totale de App.css (aucun @media print ne passe)
 * - Le HTML est déjà rendu par React → pas de re-rendu, pas de sessionStorage
 * - Cross-platform (WebView2 Windows / WebKitGTK Linux)
 * - Pas de html2canvas / jsPDF
 */
export async function exportNativePdf(): Promise<boolean> {
  // 1. Récupérer le nœud DOM du CV tel qu'il est rendu dans l'aperçu
  const cvNode = document.getElementById('printable-cv');
  if (!cvNode) {
    console.error('exportNativePdf: #printable-cv introuvable');
    return false;
  }

  // 2. Capturer le HTML rendu
  let cvHtml = cvNode.outerHTML;

  // Le style inline du header doit correspondre au padding du conteneur (40px)
  // pour que le bleed du header et les marges internes soient corrects
  cvHtml = cvHtml.replace(
    /style="margin:\s*-40px\s*-40px[^"]*"/,
    'style="margin: -28px -32px 0.75rem; padding: 28px 32px; background-color: rgb(38, 162, 105);"'
  );

  // Supprimer les règles @media print injectées par le composant dans son <style> inline
  // qui réduisent le padding à 8px/10px et écrasent nos overrides via !important
  cvHtml = cvHtml
    .replace(/@media\s+print\s*\{\s*#printable-cv\s*\{[^}]+\}\s*\}/g, '')
    .replace(/@media\s+print\s*\{\s*#printable-cv\s+\.cv-header-block\s*\{[^}]+\}\s*\}/g, '');

  // 3. Collecter UNIQUEMENT les règles CSS qui concernent le CV
  //    Stratégie : prendre toutes les règles de toutes les stylesheets,
  //    mais EXCLURE :
  //    - les blocs @media print (ils contiennent position:fixed problématique)
  //    - les règles @page (on les définit nous-mêmes)
  let collectedCss = '';
  try {
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        Array.from(sheet.cssRules).forEach(rule => {
          // Exclure tous les @media print
          if (rule instanceof CSSMediaRule) {
            const mq = rule.conditionText || rule.media?.mediaText || '';
            if (mq.includes('print')) return;
          }
          // Exclure les @page (on les définit nous-mêmes)
          if (rule instanceof CSSPageRule) return;

          collectedCss += rule.cssText + '\n';
        });
      } catch {
        // CORS sur sheets externes — ignorer
      }
    });
  } catch {
    // Ignorer
  }

  // 4. Construire un document HTML autonome
  const doc = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* Reset complet — aucun héritage du layout */
    *, *::before, *::after { box-sizing: border-box; }

    /* Styles collectés de l'app (sans @media print) */
    ${collectedCss}

    /* Overrides print — appliqués en dernier, priorité maximale */
    @page {
      size: A4 portrait;
      margin: 0mm;
    }

    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 210mm !important;
      height: auto !important;
      overflow: visible !important;
      background: white !important;
    }

    /* PDF avec padding optimisé pour tenir sur une page A4 */
    #printable-cv {
      position: static !important;
      width: 210mm !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 28px 32px !important;
      zoom: 1 !important;
      transform: none !important;
    }

    /* Header compense le padding pour saigner jusqu'aux bords */
    #printable-cv .cv-header-block {
      margin: -28px -32px 0.75rem !important;
      padding: 28px 32px !important;
    }

    /* Éviter les sections orphelines en bas de page */
    #printable-cv h3 {
      break-after: avoid;
      page-break-after: avoid;
    }
    #printable-cv .cv-entry {
      break-inside: avoid;
      page-break-inside: avoid;
    }
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

  // 5. Ouvrir dans une nouvelle fenêtre via Blob URL
  const blob = new Blob([doc], { type: 'text/html; charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const printWin = window.open(url, '_blank', 'width=900,height=700');

  if (!printWin) {
    // Fallback si popup bloqué par Tauri CSP
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
