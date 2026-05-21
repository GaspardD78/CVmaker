/**
 * Suivi d'erreurs local (version Dev).
 *
 * Capture automatiquement les erreurs JS non gérées (window.onerror,
 * unhandledrejection) et les erreurs React (via ErrorBoundary). Chaque erreur
 * est ajoutée à un store en mémoire (panneau Dev) et persistée dans un fichier
 * de log local côté Rust (`dev-errors.jsonl`), aux côtés des panics Rust.
 *
 * 100% local — aucun envoi réseau. Actif en build dev, ou en build packagé via
 * localStorage `rf:devErrorTracker` = "1" (front) et l'env `RESUMEFORGE_DEV_LOG`
 * (Rust) pour la couverture backend.
 */
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './platform';

export type DevErrorSource =
  | 'react'
  | 'window.onerror'
  | 'unhandledrejection'
  | 'console.error'
  | 'manual'
  | 'rust-panic';

export interface DevErrorEntry {
  /** Epoch milliseconds. */
  timestamp: number;
  source: DevErrorSource | string;
  message: string;
  stack?: string;
  context?: string;
}

const MAX_ENTRIES = 200;
const OVERRIDE_KEY = 'rf:devErrorTracker';

/** True quand le tracker doit être actif. */
export function isDevTrackerEnabled(): boolean {
  try {
    if (import.meta.env.DEV) return true;
    return localStorage.getItem(OVERRIDE_KEY) === '1';
  } catch {
    return import.meta.env.DEV;
  }
}

interface DevErrorState {
  entries: DevErrorEntry[];
  add: (entry: DevErrorEntry) => void;
  setAll: (entries: DevErrorEntry[]) => void;
  clear: () => void;
}

export const useDevErrorStore = create<DevErrorState>((set) => ({
  entries: [],
  add: (entry) => set((s) => ({ entries: [entry, ...s.entries].slice(0, MAX_ENTRIES) })),
  setAll: (entries) => set({ entries: entries.slice(0, MAX_ENTRIES) }),
  clear: () => set({ entries: [] }),
}));

function formatConsoleArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.message || arg.name;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function normalizeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message || err.name || 'Error', stack: err.stack };
  }
  if (typeof err === 'string') return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}

let persistDisabled = false;

async function persist(entry: DevErrorEntry): Promise<void> {
  if (!isTauri() || persistDisabled) return;
  try {
    await invoke('dev_log_error', { entry });
  } catch {
    // Commande indisponible (ex. binaire release sans la commande) — on cesse
    // d'essayer pour ne pas spammer la console.
    persistDisabled = true;
  }
}

/**
 * Enregistre une erreur quelle que soit sa source : ajout au store en mémoire
 * (panneau live) + persistance best-effort dans le log disque via Tauri.
 */
export function reportError(input: {
  source: DevErrorEntry['source'];
  error?: unknown;
  message?: string;
  context?: string;
}): void {
  if (!isDevTrackerEnabled()) return;
  const norm = input.error !== undefined ? normalizeError(input.error) : { message: '', stack: undefined };
  const entry: DevErrorEntry = {
    timestamp: Date.now(),
    source: input.source,
    message: input.message || norm.message || 'Erreur inconnue',
    stack: norm.stack,
    context: input.context,
  };
  useDevErrorStore.getState().add(entry);
  void persist(entry);
}

let installed = false;

/** Branche les handlers d'erreurs JS globaux. Idempotent. */
export function installGlobalHandlers(): void {
  if (installed || !isDevTrackerEnabled() || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event: ErrorEvent) => {
    // Les erreurs de chargement de ressource n'ont ni `error` ni message utile.
    if (event.error == null && !event.message) return;
    reportError({
      source: 'window.onerror',
      error: event.error ?? event.message,
      context: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    reportError({ source: 'unhandledrejection', error: event.reason });
  });

  // Capture des erreurs de la console : on enveloppe console.error en
  // préservant le comportement d'origine (log natif conservé).
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);
    try {
      const errorArg = args.find((a) => a instanceof Error) as Error | undefined;
      const message = args.map(formatConsoleArg).join(' ');
      reportError({ source: 'console.error', error: errorArg, message });
    } catch {
      /* ne jamais laisser la journalisation casser la journalisation */
    }
  };

  // Aide au débogage manuel depuis la console : window.__rfReportError("msg")
  (window as unknown as { __rfReportError?: (m: string) => void }).__rfReportError = (m: string) =>
    reportError({ source: 'manual', message: m });
}

/** Recharge les entrées depuis le log disque (inclut panics Rust + sessions passées). */
export async function reloadFromDisk(limit = MAX_ENTRIES): Promise<void> {
  if (!isTauri()) return;
  try {
    const entries = await invoke<DevErrorEntry[]>('dev_read_errors', { limit });
    useDevErrorStore.getState().setAll(entries);
  } catch {
    /* commande indisponible — on garde le store en mémoire */
  }
}

/** Vide le log disque ET le store en mémoire. */
export async function clearAll(): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('dev_clear_errors');
    } catch {
      /* ignore */
    }
  }
  useDevErrorStore.getState().clear();
}

/** Chemin absolu du fichier de log, ou null hors Tauri. */
export async function getLogPath(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>('dev_log_path');
  } catch {
    return null;
  }
}
