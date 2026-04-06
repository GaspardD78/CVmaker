/**
 * HTTP wrapper that routes requests through the Tauri Rust backend
 * via tauri-plugin-http, bypassing browser CORS restrictions.
 *
 * Drop-in replacement for the native fetch() API in watcher parsers.
 */

import { fetch as tauriFetchImpl } from '@tauri-apps/plugin-http';

/** Realistic browser User-Agent to avoid being blocked by feed providers */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Fetch via Tauri backend (CORS-free).
 * Signature matches the web Fetch API for easy drop-in use.
 */
export async function tauriFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  return tauriFetchImpl(url, init);
}
