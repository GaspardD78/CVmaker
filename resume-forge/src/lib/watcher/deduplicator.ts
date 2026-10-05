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

/** Offre déjà en base, avec les pistes auxquelles elle est rattachée. */
export interface ExistingOffer {
  id: string;
  score: number;
  /** Pistes déjà rattachées — sert à distinguer un doublon d'un nouveau rattachement. */
  alertIds: Set<string>;
}

/**
 * Index des offres déjà collectées, par hash.
 *
 * Le simple ensemble de hashes ne suffit plus : une offre déjà en base peut
 * être captée par une piste nouvellement créée. Sans savoir à quelles pistes
 * elle est déjà rattachée, cette piste resterait vide alors que des offres
 * correspondantes dorment en base.
 */
export async function loadExistingOfferIndex(
  db: { select: <T>(sql: string, params?: unknown[]) => Promise<T> },
  profileId: string | null,
): Promise<Map<string, ExistingOffer>> {
  const rows = profileId
    ? await db.select<{ id: string; hash: string; score: number }[]>(
        'SELECT id, hash, score FROM job_offers WHERE profile_id = ?1',
        [profileId],
      )
    : await db.select<{ id: string; hash: string; score: number }[]>(
        'SELECT id, hash, score FROM job_offers WHERE profile_id IS NULL',
      );

  const byHash = new Map<string, ExistingOffer>();
  const byId = new Map<string, ExistingOffer>();
  for (const row of rows) {
    const entry: ExistingOffer = { id: row.id, score: row.score ?? 0, alertIds: new Set() };
    byHash.set(row.hash, entry);
    byId.set(row.id, entry);
  }
  if (byId.size === 0) return byHash;

  const links = await db.select<{ offer_id: string; alert_id: string }[]>(
    'SELECT offer_id, alert_id FROM job_offer_alerts',
  );
  for (const link of links) {
    byId.get(link.offer_id)?.alertIds.add(link.alert_id);
  }
  return byHash;
}

// ── Cross-source deduplication ──────────────────────────────────────────────

/**
 * Normalizes a string for fuzzy comparison: lowercase, strip accents,
 * collapse whitespace, remove punctuation.
 */
export function normalizeForDedup(text: string): string {
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
 *
 * Performance: we bucket offers by normalized company name so Levenshtein
 * only runs within each bucket. For N offers spread across K companies the
 * complexity is O(N) bucketing + O(sum bᵢ²) Levenshtein where bᵢ is the
 * bucket size — linear in practice since most buckets hold 1-2 offers.
 */
export function detectCrossSourceDuplicates(
  offers: Array<{ title: string; company: string | null; source: string; score: number; location?: string | null }>,
): Set<number> {
  const skipIndices = new Set<number>();
  const normalizedTitles = offers.map(o => normalizeForDedup(o.title));

  // Phase 1: bucket offers by normalized company name
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < offers.length; i++) {
    const company = offers[i].company ? normalizeForDedup(offers[i].company!) : '';
    if (!company) continue; // can't dedupe without company
    const arr = buckets.get(company);
    if (arr) arr.push(i);
    else buckets.set(company, [i]);
  }

  // Phase 2: only compare within each bucket
  for (const indices of buckets.values()) {
    if (indices.length < 2) continue;

    for (let a = 0; a < indices.length; a++) {
      const i = indices[a];
      if (skipIndices.has(i)) continue;

      for (let b = a + 1; b < indices.length; b++) {
        const j = indices[b];
        if (skipIndices.has(j)) continue;
        if (offers[i].source === offers[j].source) continue; // same source — already deduped by hash

        // Title similarity check
        const maxLen = Math.max(normalizedTitles[i].length, normalizedTitles[j].length);
        const maxDist = Math.max(1, Math.floor(maxLen * 0.1));
        const dist = levenshteinDistance(normalizedTitles[i], normalizedTitles[j], maxDist);

        if (dist <= maxDist) {
          // Keep the one with higher score
          const skipIdx = offers[i].score >= offers[j].score ? j : i;
          skipIndices.add(skipIdx);
          if (skipIdx === i) break; // i is gone — stop comparing against it
        }
      }
    }
  }

  // Phase 3 : offres SANS entreprise. Clé de repli = titre normalisé identique +
  // lieu identique non vide, entre sources différentes. Sans lieu, deux titres
  // identiques sont trop souvent deux postes distincts : on ne déduplique pas.
  const fallback = new Map<string, number[]>();
  for (let i = 0; i < offers.length; i++) {
    if (offers[i].company && normalizeForDedup(offers[i].company!)) continue;
    const location = offers[i].location ? normalizeForDedup(offers[i].location!) : '';
    if (!location || !normalizedTitles[i]) continue;
    const key = `${normalizedTitles[i]}|${location}`;
    const arr = fallback.get(key);
    if (arr) arr.push(i);
    else fallback.set(key, [i]);
  }
  for (const indices of fallback.values()) {
    for (let a = 0; a < indices.length; a++) {
      const i = indices[a];
      if (skipIndices.has(i)) continue;
      for (let b = a + 1; b < indices.length; b++) {
        const j = indices[b];
        if (skipIndices.has(j) || offers[i].source === offers[j].source) continue;
        const skipIdx = offers[i].score >= offers[j].score ? j : i;
        skipIndices.add(skipIdx);
        if (skipIdx === i) break;
      }
    }
  }

  return skipIndices;
}

// ── Dédoublonnage d'une liste d'offres déjà en base ─────────────────────────

/**
 * Clé de dédoublonnage d'une liste d'offres (analyse IA, affichage).
 *  - avec entreprise : entreprise + titre normalisés ;
 *  - sans entreprise : titre normalisé + lieu + source (clé de repli).
 */
export function offerDedupKey(o: { title: string; company: string | null; location?: string | null; source: string }): string {
  const title = normalizeForDedup(o.title);
  const company = o.company ? normalizeForDedup(o.company) : '';
  if (company) return `c:${company}|${title}`;
  const location = o.location ? normalizeForDedup(o.location) : '';
  return `t:${title}|${location}|${o.source}`;
}

/** Garde la première occurrence de chaque clé (l'ordre d'entrée est conservé). */
export function dedupeOffers<T extends { title: string; company: string | null; location?: string | null; source: string }>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = offerDedupKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
