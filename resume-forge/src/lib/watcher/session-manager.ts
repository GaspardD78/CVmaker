import { invoke } from '@tauri-apps/api/core';

/** Known site identifiers that support session-based scraping */
export type SessionSiteId = 'linkedin' | 'indeed' | 'hellowork' | 'glassdoor' | 'wttj';

export interface ScrapeOptions {
  /** Optional CSS selector to wait for before extracting HTML */
  waitSelector?: string;
  /** Hard timeout in seconds (default: 20) */
  timeoutSecs?: number;
  /** Override user-agent (default: Chrome's native one) */
  userAgent?: string;
}

/** Realistic desktop Chrome UA — keeps us out of obvious bot-detection buckets */
export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Fetch a fully-rendered page through a session-aware browser.
 *
 * Desktop : headless Chrome avec un `user_data_dir` par site (cookies persistés sur disque).
 * Android : `BackgroundScraper.scrapePageBlocking` (WebView offscreen Kotlin)
 *           qui partage `CookieManager.getInstance()` avec `LoginActivity`.
 *
 * L'approche iframe précédente échouait systématiquement : LinkedIn, Indeed
 * et HelloWork envoient `X-Frame-Options: DENY` (et CSP `frame-ancestors`),
 * et même si le chargement passait, l'accès cross-origin à `contentDocument`
 * léverait `SecurityError`.
 */
export async function scrapeWithSession(
  siteId: SessionSiteId,
  url: string,
  opts: ScrapeOptions = {},
  profileId?: string | null,
): Promise<string> {
  return invoke<string>('scrape_with_session', {
    siteId,
    url,
    waitSelector: opts.waitSelector ?? null,
    timeoutSecs:  opts.timeoutSecs  ?? 20,
    userAgent:    opts.userAgent    ?? DESKTOP_UA,
    profileId:    profileId ?? null,
  });
}

/**
 * Open a visible Chrome window at `loginUrl` for the user to authenticate.
 *
 * Sur Android : ouvre une nouvelle WebviewWindow Tauri.
 */
export async function openLoginFlow(
  siteId: SessionSiteId,
  loginUrl: string,
  profileId?: string | null,
  userAgent: string = DESKTOP_UA,
): Promise<void> {
  // Android comme desktop : on délègue à Rust. Sur Android, la commande
  // `open_login_flow` lance la `LoginActivity` Kotlin (WebView in-process)
  // dont les cookies sont partagés avec la WebView principale Tauri — donc
  // réutilisables ensuite par `scrapeWithIframe`.
  await invoke('open_login_flow', { siteId, loginUrl, profileId: profileId ?? null, userAgent });
}

/** Close the login browser — call after the user confirms they're logged in. */
export async function closeLoginBrowser(): Promise<void> {
  // Sur Android, l'utilisateur ferme la `LoginActivity` lui-même via le
  // bouton « Fermer » ou la touche retour ; la commande Rust est un no-op
  // mais on l'invoque quand même pour rester symétrique avec le desktop.
  await invoke('close_login_browser');
}

/** Check whether we have persisted cookies for `siteId` on disk / WebView. */
export async function sessionExists(siteId: SessionSiteId, profileId?: string | null): Promise<boolean> {
  // Sur Android comme desktop, la commande Rust va vraiment vérifier la
  // présence de cookies (CookieManager pour Android, fichiers Chromium pour
  // desktop). Plus de retour optimiste à `true`.
  return invoke<boolean>('session_exists', { siteId, profileId: profileId ?? null });
}

/** Delete the persisted session (force re-login next time). */
export async function clearSession(siteId: SessionSiteId, profileId?: string | null): Promise<void> {
  await invoke('clear_session', { siteId, profileId: profileId ?? null });
}

/** Per-site login URLs used by the UI */
export const LOGIN_URLS: Record<SessionSiteId, string> = {
  linkedin:  'https://www.linkedin.com/login',
  indeed:    'https://secure.indeed.com/auth',
  hellowork: 'https://www.hellowork.com/fr-fr/connexion.html',
  glassdoor: 'https://www.glassdoor.fr/profil/login_input.htm',
  wttj:      'https://www.welcometothejungle.com/fr/signin',
};
