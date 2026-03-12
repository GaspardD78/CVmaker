import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';

// Hauteur A4 en pixels CSS à 96 dpi (297 mm)
const A4_HEIGHT_PX = 1122;

/**
 * Exporte le CV en PDF natif via WebKitGTK (Linux) ou WebView2 (Windows).
 * Le texte reste sélectionnable → compatible ATS.
 *
 * Retourne true si l'export a réussi, false si l'utilisateur a annulé.
 */
export async function exportNativePdf(): Promise<boolean> {
  const cv = document.getElementById('printable-cv') as HTMLElement | null;
  if (!cv) return false;

  // 1. Demander le chemin de sauvegarde
  const outputPath = await save({
    defaultPath: 'cv.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!outputPath) return false;

  // 2. Calculer le facteur de zoom pour tenir sur une page A4
  const contentHeight = cv.scrollHeight;
  const scale = contentHeight > A4_HEIGHT_PX
    ? A4_HEIGHT_PX / contentHeight
    : 1;

  // 3. Appliquer la variable CSS de zoom (récupérée par @media print dans App.css)
  if (scale < 1) {
    document.documentElement.style.setProperty('--pdf-zoom', scale.toFixed(6));
  }

  // Laisser le moteur de rendu appliquer les nouveaux styles
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  try {
    // 4. Déclencher l'export natif (sans boîte de dialogue)
    await invoke('export_native_pdf', { outputPath });
    return true;
  } finally {
    // 5. Toujours restaurer la variable CSS
    document.documentElement.style.removeProperty('--pdf-zoom');
  }
}
