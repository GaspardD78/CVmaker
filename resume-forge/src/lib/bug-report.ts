/**
 * Rapports de bug (version Dev).
 *
 * Un rapport = un dossier `bug-reports/<id>/` (sous le dossier de logs de
 * l'app) contenant un `report.md` lisible par un humain ET par une IA de code
 * (description + environnement + journal des erreurs capturées) et un
 * `screenshot.png` optionnel. 100% local.
 */
import { invoke } from '@tauri-apps/api/core';
import { isTauri, isAndroid } from './platform';
import { useDevErrorStore, type DevErrorEntry } from './dev-error-tracker';

/** Attribut posé sur les overlays Dev pour les exclure des captures d'écran. */
export const DEV_OVERLAY_ATTR = 'data-dev-overlay';

export interface BugReportMeta {
  id: string;
  title: string;
  timestamp: number;
}

export interface ReportEnvironment {
  appVersion: string;
  platform: string;
  route: string;
  userAgent: string;
  viewport: string;
  capturedAt: string;
}

/** Capture l'écran courant (hors overlays Dev) en PNG data-URL, ou null. */
export async function captureScreenshot(): Promise<string | null> {
  try {
    const { default: html2canvas } = await import('html2canvas-pro');
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scale: 1,
      ignoreElements: (el: Element) => el instanceof HTMLElement && el.hasAttribute(DEV_OVERLAY_ATTR),
      x: window.scrollX,
      y: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

async function collectEnvironment(): Promise<ReportEnvironment> {
  let appVersion = 'web';
  if (isTauri()) {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      appVersion = await getVersion();
    } catch {
      /* ignore */
    }
  }
  return {
    appVersion,
    platform: isTauri() ? (isAndroid() ? 'Tauri / Android' : 'Tauri / Desktop') : 'Web',
    route: window.location.hash || window.location.pathname,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    capturedAt: new Date().toISOString(),
  };
}

function formatErrors(errors: DevErrorEntry[]): string {
  if (errors.length === 0) return '_Aucune erreur capturée._';
  return errors
    .map((e, i) => {
      const lines = [
        `### ${i + 1}. \`${e.source}\` — ${e.message}`,
        `- Heure : ${new Date(e.timestamp).toISOString()}`,
      ];
      if (e.context) lines.push(`- Contexte : ${e.context}`);
      if (e.stack) lines.push('', '```', e.stack, '```');
      return lines.join('\n');
    })
    .join('\n\n');
}

function buildReportMarkdown(opts: {
  title: string;
  description: string;
  env: ReportEnvironment;
  errors: DevErrorEntry[];
  hasScreenshot: boolean;
}): string {
  const { title, description, env, errors, hasScreenshot } = opts;
  return [
    `# ${title || 'Rapport de bug'}`,
    '',
    '## Environnement',
    `- Version : ${env.appVersion}`,
    `- Plateforme : ${env.platform}`,
    `- Route : ${env.route}`,
    `- Fenêtre : ${env.viewport}`,
    `- User-Agent : ${env.userAgent}`,
    `- Capturé le : ${env.capturedAt}`,
    '',
    '## Description',
    description.trim() || '_(à compléter)_',
    '',
    "## Capture d'écran",
    hasScreenshot ? '![screenshot](./screenshot.png)' : '_(aucune)_',
    '',
    `## Journal des erreurs (${errors.length})`,
    formatErrors(errors),
    '',
  ].join('\n');
}

async function recentErrors(limit = 50): Promise<DevErrorEntry[]> {
  if (isTauri()) {
    try {
      const disk = await invoke<DevErrorEntry[]>('dev_read_errors', { limit });
      if (disk.length) return disk;
    } catch {
      /* repli sur le store en mémoire */
    }
  }
  return useDevErrorStore.getState().entries.slice(0, limit);
}

export interface SaveResult {
  /** Chemin du dossier du rapport, ou null hors Tauri. */
  path: string | null;
  /** Markdown généré (utile pour copier hors Tauri). */
  markdown: string;
  id: string;
}

/** Crée un rapport de bug : journalisation auto + description + screenshot. */
export async function saveBugReport(opts: {
  title: string;
  description: string;
  screenshotDataUrl: string | null;
}): Promise<SaveResult> {
  const env = await collectEnvironment();
  const errors = await recentErrors();
  const markdown = buildReportMarkdown({
    title: opts.title,
    description: opts.description,
    env,
    errors,
    hasScreenshot: !!opts.screenshotDataUrl,
  });
  const id = String(Date.now());
  if (!isTauri()) {
    return { path: null, markdown, id };
  }
  const screenshotBase64 = opts.screenshotDataUrl
    ? opts.screenshotDataUrl.replace(/^data:image\/\w+;base64,/, '')
    : null;
  const path = await invoke<string>('dev_save_bug_report', { id, markdown, screenshotBase64 });
  return { path, markdown, id };
}

export async function listBugReports(): Promise<BugReportMeta[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<BugReportMeta[]>('dev_list_bug_reports');
  } catch {
    return [];
  }
}

export async function readBugReport(id: string): Promise<string> {
  if (!isTauri()) return '';
  return invoke<string>('dev_read_bug_report', { id });
}

export async function updateBugReport(id: string, markdown: string): Promise<void> {
  if (!isTauri()) return;
  await invoke('dev_update_bug_report', { id, markdown });
}

export async function deleteBugReport(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke('dev_delete_bug_report', { id });
}

export async function openBugReportDir(id: string): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('dev_open_bug_report_dir', { id });
  } catch {
    /* ignore */
  }
}
