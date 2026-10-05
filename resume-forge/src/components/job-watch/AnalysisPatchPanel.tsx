import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardPaste, Undo2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { useAuthStore } from '@/stores/authStore';
import type { JobWatchAlert } from '@/types/job-watch';
import { loadAlertOffers } from '@/lib/watcher/analysis-loader';
import type { WatchAnalysisOfferInput } from '@/lib/watcher/analysis-context';
import {
  applyChanges, applyLearnedForgets, clearUndoSnapshot, describeChange, evaluateChanges, loadUndoSnapshot,
  parseWatchAnalysisResponse, saveUndoSnapshot, simulatePatch,
  type EvaluatedChange, type ParsedAnalysis, type SnapshotStorage,
} from '@/lib/watcher/analysis-patch';

const CAUSE_LABELS = { requete: 'Requête', scoring: 'Scoring', comportement: 'Comportement', marche: 'Marché' } as const;

const storage = (): SnapshotStorage | null => {
  try { return window.localStorage; } catch { return null; }
};

/**
 * Écran « Appliquer les recommandations » : colle la réponse JSON de l'IA, la
 * valide, affiche le diff et la simulation, puis applique après confirmation.
 * Chaque application laisse un instantané qui permet de l'annuler.
 */
export function AnalysisPatchPanel({ alert }: { alert: JobWatchAlert }) {
  const { alerts, updateAlert } = useJobWatchStore();
  const { currentUserId } = useAuthStore();

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<WatchAnalysisOfferInput[]>([]);
  const [evaluated, setEvaluated] = useState<EvaluatedChange[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undoVersion, setUndoVersion] = useState(0);

  const snapshot = useMemo(() => {
    void undoVersion;
    const s = storage();
    return s ? loadUndoSnapshot(s, alert.id) : null;
  }, [alert.id, undoVersion]);

  const reset = () => {
    setParsed(null); setError(null); setEvaluated([]); setSelected(new Set()); setConfirming(false);
  };

  const handleAnalyse = async () => {
    reset();
    const result = parseWatchAnalysisResponse(text);
    if (!result.ok) { setError(result.error); return; }
    setBusy(true);
    try {
      const loaded = await loadAlertOffers(alert.id, currentUserId ?? null);
      const others = alerts.filter(a => a.id !== alert.id).map(a => ({ name: a.name, jobTitles: a.searchProfile.jobTitles }));
      const judged = evaluateChanges(result.value.changes, {
        searchProfile: alert.searchProfile, learnedDict: alert.learnedDict, otherTracks: others, offers: loaded,
      });
      setOffers(loaded);
      setParsed(result.value);
      setEvaluated(judged);
      setSelected(new Set(judged.filter(e => e.status === 'ok' || e.status === 'warn').map(e => e.change.id)));
    } catch (err) {
      setError(`Chargement des offres impossible : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const chosen = useMemo(
    () => evaluated.filter(e => selected.has(e.change.id)).map(e => e.change),
    [evaluated, selected],
  );

  const simulation = useMemo(() => {
    if (!parsed || chosen.length === 0) return null;
    return simulatePatch({
      offers,
      before: alert.searchProfile,
      after: applyChanges(alert.searchProfile, chosen),
      learnedBefore: alert.learnedDict,
      learnedAfter: applyLearnedForgets(alert.learnedDict, chosen),
      companyReputation: alert.companyReputation,
      aiFilterRule: alert.aiFilterRule,
    });
  }, [parsed, chosen, offers, alert]);

  const toggle = (id: string) => {
    setConfirming(false);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    const s = storage();
    if (s) {
      saveUndoSnapshot(s, {
        alertId: alert.id, appliedAt: new Date().toISOString(),
        searchProfile: alert.searchProfile, learnedDict: alert.learnedDict,
      });
    }
    setBusy(true);
    try {
      await updateAlert(alert.id, {
        searchProfile: applyChanges(alert.searchProfile, chosen),
        learnedDict: applyLearnedForgets(alert.learnedDict, chosen),
      });
      toast.success(`${chosen.length} changement(s) appliqué(s). Relancez une collecte pour en voir l'effet.`);
      setUndoVersion(v => v + 1);
      reset();
      setText('');
    } catch (err) {
      toast.error(`Application impossible : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    if (!snapshot) return;
    setBusy(true);
    try {
      await updateAlert(alert.id, { searchProfile: snapshot.searchProfile, learnedDict: snapshot.learnedDict });
      const s = storage();
      if (s) clearUndoSnapshot(s, alert.id);
      setUndoVersion(v => v + 1);
      toast.success('Configuration précédente restaurée.');
    } catch (err) {
      toast.error(`Annulation impossible : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
      >
        <ClipboardPaste className="w-3 h-3" />
        Appliquer les recommandations
      </button>

      {snapshot && (
        <button
          onClick={handleUndo}
          disabled={busy}
          className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50"
        >
          <Undo2 className="w-3 h-3" />
          Annuler la dernière application ({new Date(snapshot.appliedAt).toLocaleString('fr-FR')})
        </button>
      )}

      {open && (
        <div className="mt-2 space-y-2 text-xs">
          <textarea
            rows={5}
            value={text}
            onChange={e => { setText(e.target.value); reset(); }}
            placeholder="Collez ici la réponse complète de l'IA (le bloc JSON watch-analysis/v1 est repéré automatiquement)."
            className="w-full px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono text-[11px]"
          />
          <button
            onClick={handleAnalyse}
            disabled={busy || text.trim() === ''}
            className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Lire la réponse
          </button>

          {error && (
            <p className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
              <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{error}
            </p>
          )}

          {parsed && (
            <div className="space-y-2">
              {(parsed.cause || parsed.constats.length > 0) && (
                <div className="rounded border border-gray-200 dark:border-gray-700 p-2">
                  {parsed.cause && <p className="font-semibold text-gray-700 dark:text-gray-200">Cause principale : {CAUSE_LABELS[parsed.cause]}</p>}
                  <ul className="list-disc pl-4 text-gray-600 dark:text-gray-300">
                    {parsed.constats.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}

              {parsed.warnings.length > 0 && (
                <ul className="text-amber-700 dark:text-amber-300 list-disc pl-4">
                  {parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}

              {evaluated.length === 0 ? (
                <p className="text-gray-500">Aucun changement de configuration proposé.</p>
              ) : (
                <ul className="space-y-1">
                  {evaluated.map(e => {
                    const disabled = e.status === 'noop' || (e.status === 'blocked' && !e.forceable);
                    const colour = e.status === 'blocked' ? 'border-red-200 dark:border-red-800/50 bg-red-50/60 dark:bg-red-900/10'
                      : e.status === 'warn' ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-900/10'
                      : 'border-gray-200 dark:border-gray-700';
                    return (
                      <li key={e.change.id} className={`rounded border px-2 py-1 ${colour} ${e.status === 'noop' ? 'opacity-60' : ''}`}>
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={selected.has(e.change.id)}
                            disabled={disabled}
                            onChange={() => toggle(e.change.id)}
                          />
                          <span className="flex-1">
                            <span className="font-medium text-gray-800 dark:text-gray-100">{describeChange(e.change)}</span>
                            {e.status === 'blocked' && (
                              <span className="ml-1 text-red-600 dark:text-red-400">
                                {e.forceable ? '— bloqué par défaut, cochez pour forcer' : '— refusé'}
                              </span>
                            )}
                            {e.reasons.map((r, i) => (
                              <span key={i} className="block text-[11px] text-gray-500 dark:text-gray-400">
                                {e.status === 'warn' && <AlertTriangle className="inline w-3 h-3 mr-0.5 text-amber-500" />}{r}
                              </span>
                            ))}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              {parsed.justifications.length > 0 && (
                <details className="text-gray-600 dark:text-gray-300">
                  <summary className="cursor-pointer">Justifications ({parsed.justifications.length})</summary>
                  <ul className="list-disc pl-4 mt-1">
                    {parsed.justifications.map((j, i) => (
                      <li key={i}><strong>{j.change}</strong> : {j.raison}{j.impact_attendu ? ` → ${j.impact_attendu}` : ''}</li>
                    ))}
                  </ul>
                </details>
              )}

              {parsed.actionsUtilisateur.length > 0 && (
                <div className="rounded border border-blue-200 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-900/10 p-2">
                  <p className="font-semibold text-blue-800 dark:text-blue-300">À faire de votre côté</p>
                  <ul className="list-disc pl-4 text-blue-800 dark:text-blue-300">
                    {parsed.actionsUtilisateur.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}

              {simulation && (
                <div className="rounded border border-gray-200 dark:border-gray-700 p-2 space-y-1">
                  <p className="font-semibold text-gray-700 dark:text-gray-200">
                    Simulation sur {simulation.total} offres des 30 derniers jours (seuil {simulation.threshold})
                  </p>
                  <p className="text-gray-600 dark:text-gray-300">
                    {simulation.gained.length} gagnée(s), {simulation.lost.length} perdue(s)
                    {simulation.lostLiked.length > 0 && (
                      <strong className="text-red-600 dark:text-red-400"> dont {simulation.lostLiked.length} que vous aviez aimée(s) ou importée(s)</strong>
                    )}
                  </p>
                  <p className="text-gray-500 dark:text-gray-400">
                    Avant : {simulation.before.high} ≥ 70 · {simulation.before.medium} moyennes · {simulation.before.low} basses · {simulation.before.disqualified} écartées
                    {' → '}
                    Après : {simulation.after.high} ≥ 70 · {simulation.after.medium} moyennes · {simulation.after.low} basses · {simulation.after.disqualified} écartées
                  </p>
                  {(simulation.lost.length > 0 || simulation.gained.length > 0) && (
                    <ul className="max-h-40 overflow-auto text-[11px]">
                      {simulation.lost.map(o => (
                        <li key={`l${o.id}`} className={o.liked ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}>
                          − {o.title}{o.company ? ` (${o.company})` : ''} : {o.before} → {o.after}{o.reason ? ` · ${o.reason}` : ''}{o.liked ? ' · aimée/importée' : ''}
                        </li>
                      ))}
                      {simulation.gained.map(o => (
                        <li key={`g${o.id}`} className="text-emerald-700 dark:text-emerald-400">
                          + {o.title}{o.company ? ` (${o.company})` : ''} : {o.before} → {o.after}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[10px] text-gray-400">
                    Seules les offres déjà collectées sont rejouées : un changement d'intitulés ou de filtres APEC peut en ramener d'autres.
                  </p>
                </div>
              )}

              {chosen.length > 0 && (
                confirming ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gray-700 dark:text-gray-200">
                      Modifier la piste « {alert.name} » ({chosen.length} changement(s)) ? Un instantané permet d'annuler.
                    </span>
                    <button onClick={handleApply} disabled={busy} className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                      <CheckCircle2 className="inline w-3 h-3 mr-1" />Confirmer
                    </button>
                    <button onClick={() => setConfirming(false)} className="px-2.5 py-1 text-[11px] rounded-md border border-gray-300 dark:border-gray-600">Retour</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirming(true)} disabled={busy} className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                    Appliquer {chosen.length} changement(s)
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
