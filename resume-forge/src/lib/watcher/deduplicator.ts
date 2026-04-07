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

/** Build a Set of existing hashes by querying the DB, scoped to a profile */
export async function loadExistingHashes(
  db: { select: <T>(sql: string, params?: unknown[]) => Promise<T> },
  profileId: string | null,
): Promise<Set<string>> {
  const rows = profileId
    ? await db.select<{ hash: string }[]>(
        'SELECT hash FROM job_offers WHERE profile_id = ?1',
        [profileId],
      )
    : await db.select<{ hash: string }[]>(
        'SELECT hash FROM job_offers WHERE profile_id IS NULL',
      );
  return new Set(rows.map(r => r.hash));
}

// ── Cross-source deduplication ──────────────────────────────────────────────

/**
 * Normalizes a string for fuzzy comparison: lowercase, strip accents,
 * collapse whitespace, remove punctuation.
 */
function normalizeForDedup(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple Levenshtein distance for short strings (titles).
 * For performance, returns early if distance already exceeds maxDist.
 */
function levenshteinDistance(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(dp[j], dp[j - 1], prev);
      prev = temp;
    }
  }
  return dp[n];
}

export interface CrossSourceDuplicate {
  /** Index of the duplicate offer to skip (lower score) */
  skipIndex: number;
  /** Index of the kept offer (higher score) */
  keepIndex: number;
}

/**
 * Detects cross-source duplicates within a batch of scored offers.
 * Two offers are considered duplicates when:
 *  - Same company (normalized)
 *  - Title Levenshtein distance < 10% of the longer title's length
 *
 * Returns indices of duplicates to skip (the lower-scored one of each pair).
 */
export function detectCrossSourceDuplicates(
  offers: Array<{ title: string; company: string | null; source: string; score: number }>,
): Set<number> {
  const skipIndices = new Set<number>();
  const normalizedTitles = offers.map(o => normalizeForDedup(o.title));
  const normalizedCompanies = offers.map(o => o.company ? normalizeForDedup(o.company) : '');

  for (let i = 0; i < offers.length; i++) {
    if (skipIndices.has(i)) continue;
    if (!normalizedCompanies[i]) continue; // can't dedupe without company

    for (let j = i + 1; j < offers.length; j++) {
      if (skipIndices.has(j)) continue;
      if (offers[i].source === offers[j].source) continue; // same source — already deduped by hash

      // Must have same company
      if (normalizedCompanies[i] !== normalizedCompanies[j]) continue;

      // Title similarity check
      const maxLen = Math.max(normalizedTitles[i].length, normalizedTitles[j].length);
      const maxDist = Math.max(1, Math.floor(maxLen * 0.1));
      const dist = levenshteinDistance(normalizedTitles[i], normalizedTitles[j], maxDist);

      if (dist <= maxDist) {
        // Keep the one with higher score
        const skipIdx = offers[i].score >= offers[j].score ? j : i;
        skipIndices.add(skipIdx);
      }
    }
  }

  return skipIndices;
}
