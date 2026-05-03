/**
 * Helpers de détection de plateforme.
 * Centralisés ici pour éviter les duplications dans export-pdf.ts, export-docx.ts, etc.
 */

/** Retourne true si l'application tourne dans un contexte Tauri (desktop ou mobile). */
export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

/** Retourne true si la plateforme hôte est Android. */
export function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

/** Retourne true si on est sur un appareil mobile (≤ 639px ou Android/iOS). */
export function isMobilePlatform(): boolean {
  return isAndroid() || /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
}
