// Hauteur A4 en pixels CSS à 96 dpi (297 mm)
const A4_HEIGHT_PX = 1122;

/**
 * Exporte le CV en PDF via la boîte de dialogue d'impression native du système.
 * Le CSS @media print (App.css) masque tout sauf #printable-cv et applique
 * le format A4 sans marges. Fonctionne sur Linux, Windows et macOS.
 *
 * Retourne true si window.print() a été appelé, false si #printable-cv est absent.
 */
export async function exportNativePdf(): Promise<boolean> {
  const cv = document.getElementById('printable-cv') as HTMLElement | null;
  if (!cv) return false;

  // Calculer le facteur de zoom pour tenir sur une page A4
  const contentHeight = cv.scrollHeight;
  const scale = contentHeight > A4_HEIGHT_PX
    ? A4_HEIGHT_PX / contentHeight
    : 1;

  // Appliquer la variable CSS de zoom (récupérée par @media print dans App.css)
  if (scale < 1) {
    document.documentElement.style.setProperty('--pdf-zoom', scale.toFixed(6));
  }

  // Laisser le moteur de rendu appliquer les nouveaux styles
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  try {
    // Ouvrir la boîte de dialogue d'impression native (synchrone)
    // L'utilisateur choisit "Imprimer dans un fichier" / "Save as PDF"
    window.print();
    return true;
  } finally {
    // Toujours restaurer la variable CSS
    document.documentElement.style.removeProperty('--pdf-zoom');
  }
}
