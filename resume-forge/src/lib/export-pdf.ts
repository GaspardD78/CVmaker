/**
 * Exporte le CV en PDF via une page HTML autonome.
 *
 * Stratégie : capturer le HTML déjà rendu par React (#printable-cv) dans
 * la page builder, extraire les styles compilés nécessaires (Tailwind, etc.)
 * en EXCLUANT les règles @media print de App.css (qui causent position:fixed
 * et double-rendu), puis ouvrir une fenêtre standalone avec uniquement ce
 * contenu + des règles print propres.
 *
 * Avantages :
 * - Isolation totale de App.css (@media print n'atteint jamais la page d'export)
 * - Le HTML est déjà rendu par React → pas de re-rendu, pas de sessionStorage
 * - Cross-platform (WebView2 Windows / WebKitGTK Linux)
 * - Pas de html2canvas / jsPDF
 */
export async function exportNativePdf(): Promise<boolean> {
  const printableEl = document.getElementById('printable-cv');
  if (!printableEl) return false;

  // ── 1. Capture the rendered HTML ──
  const cvHtml = printableEl.outerHTML;

  // ── 2. Extract computed styles from all stylesheets ──
  // We collect all CSS rules EXCEPT @media print blocks (which contain
  // the problematic position:fixed from App.css). We'll supply our own
  // clean @media print rules instead.
  let collectedCss = '';
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        // Skip @media print rules entirely — they come from App.css
        // and contain position:fixed / visibility:hidden that breaks export
        if (rule instanceof CSSMediaRule && rule.conditionText === 'print') {
          continue;
        }
        // Skip @page rules — we provide our own
        if (rule instanceof CSSPageRule) {
          continue;
        }
        collectedCss += rule.cssText + '\n';
      }
    } catch {
      // Cross-origin stylesheets throw SecurityError — skip them
    }
  }

  // ── 3. Build the standalone HTML document ──
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    ${collectedCss}
  </style>
  <style>
    /* ── Clean print styles — no position:fixed, no visibility:hidden ── */
    @page {
      size: A4 portrait;
      margin: 0mm 0mm 0mm 0mm;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 210mm;
      background: white !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      color-adjust: exact;
    }
    body {
      overflow: visible !important;
      height: auto !important;
    }
    #printable-cv {
      position: static !important;
      display: block !important;
      width: 210mm !important;
      max-width: none !important;
      height: auto !important;
      overflow: visible !important;
      margin: 0 !important;
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 210mm !important;
        height: auto !important;
        overflow: visible !important;
      }
      #printable-cv {
        position: static !important;
        display: block !important;
        width: 210mm !important;
        max-width: none !important;
        height: auto !important;
        overflow: visible !important;
        margin: 0 !important;
      }
      #printable-cv a[href] {
        text-decoration: underline;
      }
    }
  </style>
</head>
<body>
  ${cvHtml}
  <script>
    document.fonts.ready.then(function() {
      setTimeout(function() {
        window.print();
        setTimeout(function() { window.close(); }, 500);
      }, 600);
    });
  </script>
</body>
</html>`;

  // ── 4. Open in a new window via Blob URL ──
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');

  if (!win) {
    // Popup blocked — fall back to printing in the current window
    URL.revokeObjectURL(url);
    window.print();
  } else {
    // Clean up Blob URL after the window has had time to load
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  return true;
}
