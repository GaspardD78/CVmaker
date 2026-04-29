import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, X } from 'lucide-react';
import { HealthDashboard } from './HealthDashboard';
import { useJobWatchStore } from '@/stores/jobWatchStore';

/**
 * HealthDrawer
 *
 * A floating action button (bottom-right of the offers panel) that slides open
 * a right-side drawer containing the full HealthDashboard.
 * The FAB shows a pulsing amber dot when there are active alerts.
 */
export function HealthDrawer() {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const { offers, settings } = useJobWatchStore();

  // ── Compute whether there are any active alerts (for the FAB badge) ──────────
  const hasAlerts = useMemo(() => {
    const weekCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const volume = offers.filter(o => o.fetchedAt >= weekCutoff).length;
    const active = offers.filter(o => o.isArchived === 0);
    const kanban = active.filter(o => o.kanbanId !== null).length;
    const conversionAlert = active.length > 0 && kanban / active.length < 0.05;
    const noJobTitles = settings.searchProfile.jobTitles.length === 0;
    return volume < 10 || conversionAlert || noJobTitles;
  }, [offers, settings]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  // Close on outside click (but not on the FAB itself)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      // Small delay to avoid closing immediately when FAB is clicked
      const id = setTimeout(() => document.addEventListener('mousedown', handleClick), 50);
      return () => { clearTimeout(id); document.removeEventListener('mousedown', handleClick); };
    }
  }, [open]);

  return (
    <>
      {/* ── Floating action button ──────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Santé de la recherche"
        aria-label="Ouvrir le tableau de bord santé de la recherche"
        className={`
          fixed bottom-6 right-6 z-40
          flex items-center gap-2
          px-3.5 py-2.5
          rounded-full shadow-lg shadow-black/20
          bg-white dark:bg-gray-800
          border border-gray-200 dark:border-gray-700
          text-gray-600 dark:text-gray-300
          hover:bg-gray-50 dark:hover:bg-gray-700
          hover:shadow-xl hover:shadow-black/25
          hover:-translate-y-0.5
          active:translate-y-0 active:shadow-md
          transition-all duration-150
          select-none
          ${open ? 'ring-2 ring-indigo-400 dark:ring-indigo-500' : ''}
        `}
      >
        <span className="relative flex-shrink-0">
          <BarChart2 className="w-4 h-4" />
          {hasAlerts && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </span>
        <span className="text-xs font-semibold whitespace-nowrap">
          Santé
        </span>
      </button>

      {/* ── Backdrop ────────────────────────────────────────────────────── */}
      <div
        className={`
          fixed inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-[1px]
          transition-opacity duration-200
          ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        aria-hidden="true"
      />

      {/* ── Drawer panel ────────────────────────────────────────────────── */}
      <div
        ref={drawerRef}
        className={`
          fixed top-0 right-0 z-50 h-full
          w-full sm:w-[480px] max-w-full
          bg-white dark:bg-gray-900
          border-l border-gray-200 dark:border-gray-700
          shadow-2xl shadow-black/30
          flex flex-col
          transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)]
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-modal="true"
        aria-label="Santé de la recherche"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 tracking-tight">
              Santé de la recherche
            </h2>
            {hasAlerts && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                ⚠ Alertes
              </span>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Fermer"
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer body — scrollable */}
        <div className="flex-1 overflow-y-auto p-4">
          <HealthDashboard alwaysExpanded />
        </div>
      </div>
    </>
  );
}
