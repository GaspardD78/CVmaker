/**
 * Déduplication des offres par hash SHA-256(source + url).
 * Utilise la Web Crypto API (disponible dans le contexte Tauri WebView).
 */

import type { JobSource } from '@/types/job-watch';

/** Compute SHA-256 hash of (source + url) as a hex string */
export async function computeOfferHash(source: JobSource, url: string): Promise<string> {
  const data = new TextEncoder().encode(source + url);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Check which hashes from the list are already present in the database */
export async function filterNewHashes(
  hashes: string[],
  existingHashes: Set<string>
): Promise<string[]> {
  return hashes.filter(h => !existingHashes.has(h));
}

/** Build a Set of existing hashes by querying the DB */
export async function loadExistingHashes(
  db: { select: <T>(sql: string, params?: unknown[]) => Promise<T> }
): Promise<Set<string>> {
  const rows = await db.select<{ hash: string }[]>('SELECT hash FROM job_offers');
  return new Set(rows.map(r => r.hash));
}
