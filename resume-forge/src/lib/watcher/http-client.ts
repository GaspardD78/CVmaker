/**
 * Industrial HTTP client for the job watcher.
 *
 * Built on top of `tauriFetch` (tauri-plugin-http) and adds three safety
 * layers that every parser benefits from:
 *
 *   1. Timeout per request (AbortController)
 *   2. Exponential-backoff retry on transient failures (network error, 429, 5xx)
 *   3. Per-source circuit breaker: after N consecutive failures the source is
 *      considered "open" and requests are rejected immediately for a cooldown
 *      period, preventing one slow/broken source from blocking the whole run.
 *
 * Parsers call `fetchResilient(url, { source: 'wttj', ... })` instead of
 * `tauriFetch(url, ...)` directly.
 */

import { tauriFetch } from './http';
import type { JobSource } from '@/types/job-watch';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RetryPolicy {
  /** Total attempts (1 means no retry). Default 3. */
  attempts: number;
  /** Base delay in ms for exponential backoff (actual = base * 2^(attempt-1)). Default 500. */
  baseDelayMs: number;
  /** Maximum backoff delay in ms. Default 8000. */
  maxDelayMs: number;
  /**
   * Predicate: should we retry this outcome?
   * `res` is null when an error was thrown (network failure, abort, CORS).
   * Default: retry on network errors, 429, and any 5xx.
   */
  shouldRetry: (res: Response | null, err: Error | null) => boolean;
}

export interface CircuitBreakerPolicy {
  /** Consecutive failures before the circuit opens. Default 3. */
  threshold: number;
  /** Cooldown in ms once the circuit is open. Default 15 min. */
  cooldownMs: number;
}

export interface ResilientFetchOptions extends RequestInit {
  /** Source identifier — required for circuit breaker state keying. */
  source: JobSource | string;
  /** Per-request timeout in ms. Default 10_000. */
  timeoutMs?: number;
  /** Retry policy (partial overrides over defaults). */
  retry?: Partial<RetryPolicy>;
  /** Circuit breaker policy (partial overrides over defaults). */
  circuitBreaker?: Partial<CircuitBreakerPolicy>;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_RETRY: RetryPolicy = {
  attempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  shouldRetry: (res, err) => {
    if (err) return true;                            // network/abort/CORS
    if (!res) return true;
    if (res.status === 429) return true;             // rate-limited — back off and retry
    if (res.status >= 500 && res.status < 600) return true; // server transient
    return false;
  },
};

const DEFAULT_CIRCUIT: CircuitBreakerPolicy = {
  threshold: 3,
  cooldownMs: 15 * 60 * 1_000,
};

const DEFAULT_TIMEOUT_MS = 10_000;

// ── Circuit breaker state ────────────────────────────────────────────────────

interface CircuitState {
  failures: number;
  /** Unix ms until which the circuit stays open; 0 means closed. */
  openUntil: number;
}

const circuitStates = new Map<string, CircuitState>();

function getState(source: string): CircuitState {
  let s = circuitStates.get(source);
  if (!s) {
    s = { failures: 0, openUntil: 0 };
    circuitStates.set(source, s);
  }
  return s;
}

/** Returns true if the circuit is currently open (requests are blocked). */
export function isCircuitOpen(source: string): boolean {
  const s = circuitStates.get(source);
  if (!s || s.openUntil === 0) return false;
  if (Date.now() >= s.openUntil) {
    // Cooldown elapsed — reset to closed state
    s.failures = 0;
    s.openUntil = 0;
    return false;
  }
  return true;
}

/** Manually reset a source's circuit state (e.g. after user fixes credentials). */
export function resetCircuit(source: string): void {
  const s = circuitStates.get(source);
  if (s) {
    s.failures = 0;
    s.openUntil = 0;
  }
}

/** Diagnostic — exposed for the HealthDashboard. */
export function getCircuitSnapshot(): Record<string, { failures: number; openUntil: number }> {
  const out: Record<string, { failures: number; openUntil: number }> = {};
  for (const [k, v] of circuitStates.entries()) {
    out[k] = { failures: v.failures, openUntil: v.openUntil };
  }
  return out;
}

// ── Error class ──────────────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  constructor(public readonly source: string, public readonly openUntil: number) {
    super(
      `Source "${source}" temporairement désactivée (circuit breaker ouvert jusqu'à ${new Date(openUntil).toISOString()})`
    );
    this.name = 'CircuitOpenError';
  }
}

// ── Main API ─────────────────────────────────────────────────────────────────

/**
 * Resilient wrapper around `tauriFetch`. Applies timeout, retry with
 * exponential backoff, and per-source circuit breaker.
 *
 * Circuit breaker semantics:
 *   - A "failure" is either a thrown error OR a response where
 *     `shouldRetry()` is still true at the final attempt (e.g. all retries
 *     exhausted on 5xx).
 *   - A 2xx/3xx response (or a 4xx that isn't 429) resets the counter.
 */
export async function fetchResilient(
  url: string,
  options: ResilientFetchOptions,
): Promise<Response> {
  const { source, timeoutMs = DEFAULT_TIMEOUT_MS, retry, circuitBreaker, ...rest } = options;

  const retryPolicy: RetryPolicy = { ...DEFAULT_RETRY, ...retry };
  const circuit: CircuitBreakerPolicy = { ...DEFAULT_CIRCUIT, ...circuitBreaker };

  const state = getState(source);

  if (state.openUntil !== 0 && Date.now() < state.openUntil) {
    throw new CircuitOpenError(source, state.openUntil);
  }

  // Allow caller to pass their own AbortSignal — we chain with our timeout one
  const userSignal = rest.signal ?? null;

  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= retryPolicy.attempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Forward user abort to our controller
    const onUserAbort = () => controller.abort();
    if (userSignal) {
      if (userSignal.aborted) controller.abort();
      else userSignal.addEventListener('abort', onUserAbort, { once: true });
    }

    try {
      const res = await tauriFetch(url, { ...rest, signal: controller.signal });

      if (!retryPolicy.shouldRetry(res, null)) {
        // Success path — reset circuit and return
        state.failures = 0;
        state.openUntil = 0;
        return res;
      }

      // Retryable response (5xx, 429)
      lastResponse = res;
      lastError = null;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      lastResponse = null;

      // If shouldRetry says no (unusual for errors but possible), break
      if (!retryPolicy.shouldRetry(null, lastError)) break;
    } finally {
      clearTimeout(timeoutId);
      if (userSignal) userSignal.removeEventListener('abort', onUserAbort);
    }

    // Back off before next attempt (no delay after the last attempt)
    if (attempt < retryPolicy.attempts) {
      const delay = Math.min(
        retryPolicy.baseDelayMs * Math.pow(2, attempt - 1),
        retryPolicy.maxDelayMs,
      );
      await sleep(delay);
    }
  }

  // All attempts exhausted — record failure against the circuit
  state.failures += 1;
  if (state.failures >= circuit.threshold) {
    state.openUntil = Date.now() + circuit.cooldownMs;
  }

  if (lastError) throw lastError;
  if (lastResponse) return lastResponse;
  throw new Error(`fetchResilient(${source}): no attempt was made`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Test-only helpers ────────────────────────────────────────────────────────

/** Clear all circuit state. Exported for tests only — do not use in production code. */
export function __resetAllCircuitsForTests(): void {
  circuitStates.clear();
}
