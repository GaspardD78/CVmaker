import { useCallback, useEffect, useState } from 'react';
import { Bug, X, Trash2, RefreshCw, Copy, Check, Plus, Pencil, FolderOpen } from 'lucide-react';
import { useDevErrorStore, reloadFromDisk, clearAll, getLogPath } from '@/lib/dev-error-tracker';
import { listBugReports, deleteBugReport, openBugReportDir, type BugReportMeta } from '@/lib/bug-report';
import { BugReportDialog } from './BugReportDialog';

const SOURCE_BADGE: Record<string, string> = {
  react: 'bg-purple-100 text-purple-700',
  'window.onerror': 'bg-red-100 text-red-700',
  unhandledrejection: 'bg-orange-100 text-orange-700',
  'console.error': 'bg-yellow-100 text-yellow-700',
  'rust-panic': 'bg-rose-200 text-rose-800',
  manual: 'bg-gray-100 text-gray-700',
};

function badgeClass(source: string): string {
  return SOURCE_BADGE[source] ?? 'bg-gray-100 text-gray-700';
}

type DialogMode = { kind: 'create' } | { kind: 'edit'; id: string };

/** Panneau de suivi d'erreurs + rapports de bug flottant (Dev uniquement). */
export function DevErrorPanel() {
  const entries = useDevErrorStore((s) => s.entries);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'errors' | 'reports'>('errors');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [reports, setReports] = useState<BugReportMeta[]>([]);
  const [dialog, setDialog] = useState<DialogMode | null>(null);

  const refreshReports = useCallback(() => {
    void listBugReports().then(setReports);
  }, []);

  useEffect(() => {
    if (!open) return;
    void reloadFromDisk();
    void getLogPath().then(setLogPath);
    refreshReports();
  }, [open, refreshReports]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponible */
    }
  };

  if (!open) {
    return (
      <button
        data-dev-overlay=""
        onClick={() => setOpen(true)}
        title="Suivi d'erreurs (Dev)"
        className="fixed bottom-4 left-4 z-[9999] flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-2 text-xs font-medium text-white shadow-lg hover:bg-gray-800"
      >
        <Bug size={14} />
        {entries.length > 0 && (
          <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-4">{entries.length}</span>
        )}
      </button>
    );
  }

  const tabClass = (active: boolean) =>
    `px-2.5 py-1 text-xs font-medium rounded ${active ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`;

  return (
    <>
      <div
        data-dev-overlay=""
        className="fixed bottom-4 left-4 z-[9999] flex max-h-[70vh] w-[min(92vw,520px)] flex-col rounded-lg border border-gray-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
          <div className="flex items-center gap-2">
            <Bug size={15} className="text-gray-700" />
            <button onClick={() => setTab('errors')} className={tabClass(tab === 'errors')}>
              Erreurs ({entries.length})
            </button>
            <button onClick={() => setTab('reports')} className={tabClass(tab === 'reports')}>
              Rapports ({reports.length})
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setDialog({ kind: 'create' })} title="Déclarer un bug" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
              <Plus size={15} />
            </button>
            {tab === 'errors' && (
              <>
                <button onClick={() => void reloadFromDisk()} title="Recharger depuis le disque" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
                  <RefreshCw size={15} />
                </button>
                <button onClick={copyAll} title="Copier tout (JSON)" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
                  {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
                </button>
                <button onClick={() => void clearAll()} title="Vider" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
                  <Trash2 size={15} />
                </button>
              </>
            )}
            <button onClick={() => setOpen(false)} title="Fermer" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'errors' ? (
            entries.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">Aucune erreur capturée.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {entries.map((e, i) => (
                  <li key={`${e.timestamp}-${i}`} className="px-3 py-2">
                    <button onClick={() => setExpanded(expanded === i ? null : i)} className="flex w-full items-start gap-2 text-left">
                      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClass(e.source)}`}>{e.source}</span>
                      <span className="flex-1 break-words text-sm text-gray-800">{e.message}</span>
                      <span className="shrink-0 text-[10px] text-gray-400">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    </button>
                    {expanded === i && (
                      <div className="mt-2 space-y-2">
                        {e.context && (
                          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-[11px] text-gray-600">{e.context}</pre>
                        )}
                        {e.stack && (
                          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-gray-900 p-2 text-[11px] text-gray-100">{e.stack}</pre>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : reports.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">
              Aucun rapport. Cliquez sur <Plus size={12} className="inline" /> pour déclarer un bug.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-800">{r.title}</p>
                    <p className="text-[10px] text-gray-400">{new Date(r.timestamp).toLocaleString()}</p>
                  </div>
                  <button onClick={() => setDialog({ kind: 'edit', id: r.id })} title="Éditer" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => void openBugReportDir(r.id)} title="Ouvrir le dossier" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
                    <FolderOpen size={14} />
                  </button>
                  <button
                    onClick={() => void deleteBugReport(r.id).then(refreshReports)}
                    title="Supprimer"
                    className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {tab === 'errors' && logPath && (
          <div className="break-all border-t border-gray-200 px-3 py-1.5 text-[10px] text-gray-400">{logPath}</div>
        )}
      </div>

      {dialog && (
        <BugReportDialog
          mode={dialog}
          errorCount={entries.length}
          onClose={() => setDialog(null)}
          onSaved={refreshReports}
        />
      )}
    </>
  );
}
