/**
 * Tests for the resilient HTTP client: retry + circuit breaker + timeout.
 * We stub `tauriFetch` so the tests run without a real network or Tauri runtime.
 */

import { describe, expect, test, beforeEach, mock } from 'bun:test';

// Intercept the Tauri plugin at the leaf — this avoids needing the native
// module to be present in the test environment and feeds our stubbed fetch
// through the real `tauriFetch` wrapper in `./http`.
let fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = async () => {
  throw new Error('fetchImpl not set');
};

mock.module('@tauri-apps/plugin-http', () => ({
  fetch: (url: string, init?: RequestInit) => fetchImpl(url, init),
}));

import {
  fetchResilient,
  isCircuitOpen,
  resetCircuit,
  CircuitOpenError,
  __resetAllCircuitsForTests,
} from './http-client';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  __resetAllCircuitsForTests();
  fetchImpl = async () => new Response('ok', { status: 200 });
});

describe('fetchResilient — success path', () => {
  test('returns the response on first success', async () => {
    let calls = 0;
    fetchImpl = async () => { calls++; return jsonResponse(200, { ok: true }); };

    const res = await fetchResilient('https://x.test', { source: 'test_src' });
    expect(res.ok).toBe(true);
    expect(calls).toBe(1);
  });

  test('non-retryable 4xx (e.g. 404) returns immediately without retry', async () => {
    let calls = 0;
    fetchImpl = async () => { calls++; return jsonResponse(404); };

    const res = await fetchResilient('https://x.test', { source: 'test_src' });
    expect(res.status).toBe(404);
    expect(calls).toBe(1);
  });
});

describe('fetchResilient — retry behaviour', () => {
  test('retries up to `attempts` on 5xx then returns last 5xx', async () => {
    let calls = 0;
    fetchImpl = async () => { calls++; return jsonResponse(503); };

    const res = await fetchResilient('https://x.test', {
      source: 'test_src',
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    });
    expect(res.status).toBe(503);
    expect(calls).toBe(3);
  });

  test('retries on thrown error then succeeds on second attempt', async () => {
    let calls = 0;
    fetchImpl = async () => {
      calls++;
      if (calls === 1) throw new Error('network fail');
      return jsonResponse(200, { retried: true });
    };

    const res = await fetchResilient('https://x.test', {
      source: 'test_src',
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    });
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
  });

  test('retries on 429 rate-limit', async () => {
    let calls = 0;
    fetchImpl = async () => {
      calls++;
      return calls < 2 ? jsonResponse(429) : jsonResponse(200);
    };

    const res = await fetchResilient('https://x.test', {
      source: 'test_src',
      retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    });
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
  });
});

describe('fetchResilient — circuit breaker', () => {
  test('opens circuit after threshold consecutive failures', async () => {
    fetchImpl = async () => jsonResponse(500);

    const opts = {
      source: 'cb_test',
      retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
      circuitBreaker: { threshold: 2, cooldownMs: 60_000 },
    };

    // First failure — circuit still closed
    await fetchResilient('https://x.test', opts);
    expect(isCircuitOpen('cb_test')).toBe(false);

    // Second failure — circuit opens
    await fetchResilient('https://x.test', opts);
    expect(isCircuitOpen('cb_test')).toBe(true);

    // Third call is short-circuited with CircuitOpenError
    let thrown: unknown = null;
    try {
      await fetchResilient('https://x.test', opts);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(CircuitOpenError);
  });

  test('successful call resets failure counter', async () => {
    let step = 0;
    fetchImpl = async () => {
      step++;
      if (step === 1) return jsonResponse(500); // fail
      return jsonResponse(200);                 // succeed — should reset
    };

    const opts = {
      source: 'cb_reset',
      retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
      circuitBreaker: { threshold: 2, cooldownMs: 60_000 },
    };

    await fetchResilient('https://x.test', opts);
    await fetchResilient('https://x.test', opts); // success resets counter

    // One more failure shouldn't open the circuit (counter is back to 0)
    fetchImpl = async () => jsonResponse(500);
    await fetchResilient('https://x.test', opts);
    expect(isCircuitOpen('cb_reset')).toBe(false);
  });

  test('resetCircuit() clears state manually', async () => {
    fetchImpl = async () => jsonResponse(500);
    const opts = {
      source: 'cb_manual',
      retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
      circuitBreaker: { threshold: 1, cooldownMs: 60_000 },
    };

    await fetchResilient('https://x.test', opts);
    expect(isCircuitOpen('cb_manual')).toBe(true);

    resetCircuit('cb_manual');
    expect(isCircuitOpen('cb_manual')).toBe(false);
  });
});

describe('fetchResilient — timeout', () => {
  test('aborts long-running request after timeoutMs', async () => {
    fetchImpl = async (_url, init) => {
      // Simulate a pending request that resolves only when aborted
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    };

    let thrown: unknown = null;
    try {
      await fetchResilient('https://x.test', {
        source: 'timeout_test',
        timeoutMs: 10,
        retry: { attempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
  });
});
