import { useEffect, useState } from 'react';
import { buildDesktopExportHtml } from '@/lib/export-pdf';
import { measurePrintOverflow, type PrintOverflow } from '@/lib/print-overflow';

/**
 * Délai (ms) après la dernière modification du CV avant de mesurer : aucune
 * mesure pendant une saisie continue, chaque frappe relance le délai.
 */
const DEBOUNCE_MS = 600;
/** Délai de la toute première mesure, à l'ouverture du CV. */
const FIRST_DELAY_MS = 100;
/** Attente maximale d'un moment d'inactivité du navigateur après le délai. */
const IDLE_TIMEOUT_MS = 500;

export interface PreviewOverflowState {
  /** Dernier résultat complet ; null avant la première mesure ou après une erreur. */
  result: PrintOverflow | null;
  /** Le CV a changé depuis `result` : une nouvelle mesure est prévue ou en cours. */
  updating: boolean;
  /** La dernière mesure a échoué. */
  error: boolean;
}

const INITIAL: PreviewOverflowState = { result: null, updating: true, error: false };

type IdleHandle = { cancel: () => void };

function whenIdle(callback: () => void): IdleHandle {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS });
    return { cancel: () => window.cancelIdleCallback(id) };
  }
  const id = window.setTimeout(callback, 0);
  return { cancel: () => window.clearTimeout(id) };
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/**
 * Mesure en continu le dépassement de page de l'aperçu, avec exactement la
 * même chaîne que l'export desktop : buildDesktopExportHtml puis
 * measurePrintOverflow (qui mémorise la dernière mesure complète, réutilisée
 * par la confirmation d'export tant que le CV n'a pas changé).
 *
 * - toute modification de `cvElement` (texte, blocs, réglages de design,
 *   template) annule la mesure en cours et en planifie une nouvelle. Les
 *   mutations sans effet sont ignorées : React réécrit à chaque rendu le
 *   <style> injecté par PrintableCV avec un contenu identique, ce qui sinon
 *   relancerait une mesure après chaque résultat ;
 * - la mesure attend DEBOUNCE_MS sans modification, puis un moment d'inactivité ;
 * - `enabled` à false (Android, navigateur) : aucune mesure.
 */
export function usePrintOverflow(cvElement: HTMLElement | null, enabled: boolean): PreviewOverflowState {
  const [state, setState] = useState<PreviewOverflowState>(INITIAL);

  useEffect(() => {
    if (!enabled || !cvElement) return;
    let disposed = false;
    let timer: number | undefined;
    let idle: IdleHandle | null = null;
    let controller: AbortController | null = null;

    const run = async () => {
      const current = new AbortController();
      controller = current;
      try {
        const html = await buildDesktopExportHtml(cvElement);
        const result = await measurePrintOverflow(html, { signal: current.signal });
        if (disposed || current.signal.aborted) return;
        setState({ result, updating: false, error: false });
      } catch (e) {
        if (disposed || current.signal.aborted || isAbort(e)) return;
        console.error('Mesure du dépassement de page (aperçu) impossible :', e);
        setState({ result: null, updating: false, error: true });
      }
    };

    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      idle?.cancel();
      controller?.abort();
      // Garde le résultat précédent (affiché grisé) ; même objet si déjà en attente.
      setState((s) => (s.updating ? s : { ...s, updating: true }));
      timer = window.setTimeout(() => { idle = whenIdle(() => { void run(); }); }, delay);
    };

    // Dernier état connu du CV : une mutation qui ne change pas le HTML est ignorée.
    let snapshot = cvElement.outerHTML;
    const observer = new MutationObserver(() => {
      const current = cvElement.outerHTML;
      if (current === snapshot) return;
      snapshot = current;
      schedule(DEBOUNCE_MS);
    });
    observer.observe(cvElement, { subtree: true, childList: true, characterData: true, attributes: true });
    schedule(FIRST_DELAY_MS);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearTimeout(timer);
      idle?.cancel();
      controller?.abort();
    };
  }, [cvElement, enabled]);

  return state;
}
