/**
 * Session manager — thin TS wrappers around the Tauri WebView commands
 * defined in `src-tauri/src/lib.rs`.
 *
 * Each site the user authenticates against has its own persistent
 * `user_data_dir` on disk. The Rust commands handle the Chrome lifecycle.
 */

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
 * Fetch a fully-rendered page through a headless Chrome that carries the
 * user's cookies for `siteId`. Returns the page's HTML after JS rendering.
 *
 * @throws Error with a human-readable message if Chrome is missing, the
 *   selector never rendered, or the page failed to load.
 */
export async function scrapeWithSession(
  siteId: SessionSiteId,
  url: string,
  opts: ScrapeOptions = {},
): Promise<string> {
  return invoke<string>('scrape_with_session', {
    siteId,
    url,
    waitSelector: opts.waitSelector ?? null,
    timeoutSecs:  opts.timeoutSecs  ?? 20,
    userAgent:    opts.userAgent    ?? DESKTOP_UA,
  });
}

/**
 * Open a visible Chrome window at `loginUrl` for the user to authenticate.
 * The browser stays alive until `closeLoginBrowser` is called — cookies
 * are flushed to disk on close.
 */
export async function openLoginFlow(siteId: SessionSiteId, loginUrl: string): Promise<void> {
  await invoke('open_login_flow', { siteId, loginUrl });
}

/** Close the login browser — call after the user confirms they're logged in. */
export async function closeLoginBrowser(): Promise<void> {
  await invoke('close_login_browser');
}

/** Check whether we have persisted cookies for `siteId` on disk. */
export async function sessionExists(siteId: SessionSiteId): Promise<boolean> {
  return invoke<boolean>('session_exists', { siteId });
}

/** Delete the persisted session (force re-login next time). */
export async function clearSession(siteId: SessionSiteId): Promise<void> {
  await invoke('clear_session', { siteId });
}

/** Per-site login URLs used by the UI */
export const LOGIN_URLS: Record<SessionSiteId, string> = {
  linkedin:  'https://www.linkedin.com/login',
  indeed:    'https://secure.indeed.com/auth',
  hellowork: 'https://www.hellowork.com/fr-fr/connexion.html',
  glassdoor: 'https://www.glassdoor.fr/profil/login_input.htm',
  wttj:      'https://www.welcometothejungle.com/fr/signin',
};
