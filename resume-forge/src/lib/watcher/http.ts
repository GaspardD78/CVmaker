/**
 * HTTP wrapper that routes requests through the Tauri Rust backend
 * via tauri-plugin-http, bypassing browser CORS restrictions.
 *
 * Drop-in replacement for the native fetch() API in watcher parsers.
 */

import { fetch as tauriFetchImpl } from '@tauri-apps/plugin-http';

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
