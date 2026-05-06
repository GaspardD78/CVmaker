import { writeFile } from '@tauri-apps/plugin-fs';
import { isTauri, isAndroid } from './platform';
import { toast } from 'sonner';

/**
 * Partage et téléchargement de fichiers.
 *
 * Sur Android (WebView Tauri) : utilise la Web Share API avec fichiers
 * si disponible, sinon sauvegarde dans le dossier Téléchargements.
 * Sur Desktop : déclenche un téléchargement via <a> (fallback).
 */
export async function shareBlob(
  blob: Blob,
  filename: string,
  mimeType: string,
): Promise<void> {
  // Web Share API avec fichiers (Android WebView Chrome, iOS Safari)
  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).canShare?.({ files: [new File([blob], filename, { type: mimeType })] })
  ) {
    try {
      const file = new File([blob], filename, { type: mimeType });
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      console.warn('Share failed or aborted, falling back to download', e);
    }
  }

  // Fallback natif pour Android (le <a> ne marche pas dans la WebView)
  if (isTauri() && isAndroid()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const filePath = await save({
        defaultPath: filename,
        filters: [{ name: 'Document', extensions: [filename.split('.').pop() || 'pdf'] }]
      });

      if (filePath) {
        const buffer = await blob.arrayBuffer();
        await writeFile(filePath, new Uint8Array(buffer));
        toast.success(`Fichier enregistré avec succès.`);
      }
      return;
    } catch (error) {
      console.error('Erreur lors de la sauvegarde Android:', error);
      toast.error("Impossible de sauvegarder le fichier.");
      return;
    }
  }

  // Fallback universel : téléchargement via <a>
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Léger délai pour laisser le navigateur initier le téléchargement
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
