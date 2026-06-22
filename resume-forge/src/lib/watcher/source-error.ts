/**
 * Classification des erreurs de sources tierces.
 *
 * Le collecteur (`fetcher.ts`) tente chaque source dans un `try/catch` : si un
 * parser échoue, l'échec est tracé dans le HealthDashboard (`job_watch_fetch_log`)
 * et les autres sources continuent. Reste à décider COMMENT journaliser cet
 * échec côté console, car le suivi d'erreurs dev (`dev-error-tracker.ts`)
 * n'enveloppe que `console.error` : tout ce qui passe par `console.error`
 * remonte donc comme un « bug » dans les rapports.
 *
 * Or l'indisponibilité d'une source externe (APEC qui renvoie HTTP 500, LinkedIn
 * qui rate-limite, un blocage anti-bot, une coupure réseau…) n'est PAS un bug de
 * l'application : c'est une condition opérationnelle attendue, déjà retryée côté
 * parser et visible dans le HealthDashboard. La faire remonter comme un bug
 * effraie l'utilisateur sans rien apporter.
 *
 * `isOperationalSourceError` distingue ces pannes opérationnelles des vraies
 * erreurs applicatives (TypeError, accès à `undefined`, invariant cassé…), qui,
 * elles, doivent rester des `console.error`.
 */

/**
 * Retourne `true` si le message d'erreur correspond à une panne opérationnelle
 * d'une source tierce (réseau, statut HTTP d'erreur, anti-bot, quota), par
 * opposition à un bug applicatif.
 */
export function isOperationalSourceError(message: string): boolean {
  const m = message.toLowerCase();

  // 1. Statut HTTP d'erreur (4xx/5xx) renvoyé par le service distant. On exige
  //    un mot-clé « statut » à proximité du code pour éviter de confondre un
  //    code HTTP avec un nombre quelconque présent dans un message de bug.
  //    Couvre les formats produits par tous nos parsers :
  //      « APEC HTTP 500 », « LinkedIn jobs-guest API 429 »,
  //      « HTTP 403 », « France Travail search error 503 : … »,
  //      « DuckDuckGo HTML 403 : … » (legacy).
  if (/\b(?:http|api|html|status|statut|erreur|error|code)\b[^]{0,12}\b[45]\d\d\b/.test(m)) {
    return true;
  }

  // 2. Réseau, blocage anti-bot, quota / rate-limit, identifiants.
  return [
    'réseau', 'network', 'timeout', 'timed out', 'failed to fetch', 'fetch failed',
    'econnreset', 'econnrefused', 'etimedout', 'enotfound', 'error sending request',
    'forbidden', 'too many requests', 'rate limit', 'rate-limit',
    'captcha', 'challenge', 'anti-bot', 'bots use',
    'unauthorized', 'credentials', 'identifiants',
  ].some(k => m.includes(k));
}
