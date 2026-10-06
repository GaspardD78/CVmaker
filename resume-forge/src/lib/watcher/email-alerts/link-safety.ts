/**
 * Sécurité des liens d'e-mails (spec 007, phase 3).
 *
 * Le contenu d'un e-mail est une donnée non fiable : seuls les liens https vers
 * les domaines attendus (apec.fr, emploi-territorial.fr, et leurs sous-domaines)
 * sont retenus. Un lien de suivi ou un domaine imitant l'un d'eux est refusé.
 */

export const ALLOWED_ALERT_DOMAINS: readonly string[] = ['apec.fr', 'emploi-territorial.fr'];

export function isAllowedAlertLink(raw: string, allowed: readonly string[] = ALLOWED_ALERT_DOMAINS): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return allowed.some(domain => host === domain || host.endsWith(`.${domain}`));
}

/** Retire requête de suivi et ancre d'un lien autorisé ; null si le lien est refusé. */
export function cleanAlertLink(raw: string, allowed: readonly string[] = ALLOWED_ALERT_DOMAINS): string | null {
  if (!isAllowedAlertLink(raw, allowed)) return null;
  const url = new URL(raw.trim());
  url.search = '';
  url.hash = '';
  return url.toString();
}
