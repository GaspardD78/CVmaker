/**
 * Partage et téléchargement de fichiers.
 *
 * Sur Android (WebView Tauri) : utilise la Web Share API avec fichiers
 * si disponible, sinon crée un lien de téléchargement.
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
    const file = new File([blob], filename, { type: mimeType });
    await navigator.share({ files: [file], title: filename });
    return;
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
