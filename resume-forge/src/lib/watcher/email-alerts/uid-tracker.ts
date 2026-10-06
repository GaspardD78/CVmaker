/**
 * Suivi par UID IMAP (spec 007, phase 3) — lecture seule : aucun e-mail n'est
 * marqué lu, déplacé ni supprimé. On retient le plus grand UID traité par
 * dossier ; si le serveur change `UIDVALIDITY`, les UID ne sont plus
 * comparables et le suivi repart de la fenêtre initiale.
 */

/** Fenêtre de lecture au premier passage. */
export const INITIAL_WINDOW_DAYS = 30;

export interface UidCursor {
  uidValidity: number;
  lastUid: number;
}

/** UID à lire, sans doublon, dans l'ordre. `cursor` null ou périmé : tout est nouveau. */
export function selectNewUids(
  available: readonly number[],
  cursor: UidCursor | null,
  currentUidValidity: number,
): number[] {
  const floor = cursor && cursor.uidValidity === currentUidValidity ? cursor.lastUid : 0;
  return [...new Set(available)].filter(uid => uid > floor).sort((a, b) => a - b);
}

/** Curseur après traitement : jamais en arrière, repart de zéro si `UIDVALIDITY` a changé. */
export function advanceCursor(
  cursor: UidCursor | null,
  currentUidValidity: number,
  processed: readonly number[],
): UidCursor {
  const base = cursor && cursor.uidValidity === currentUidValidity ? cursor.lastUid : 0;
  return { uidValidity: currentUidValidity, lastUid: Math.max(base, ...processed) };
}

/** Date `SINCE` du premier passage (jour, format IMAP `d-Mon-yyyy`). */
export function initialSince(now: Date = new Date()): string {
  const d = new Date(now.getTime() - INITIAL_WINDOW_DAYS * 86_400_000);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${d.getUTCDate()}-${mon}-${d.getUTCFullYear()}`;
}
