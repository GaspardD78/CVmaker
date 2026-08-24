/**
 * Liste des pistes du portefeuille.
 *
 * C'est le point d'entrée de la configuration : on choisit d'abord la piste
 * que l'on veut régler, puis on l'édite dans les sections qui suivent. Sans
 * cette étape, éditer « la » recherche n'aurait plus de sens dès qu'il y en a
 * plusieurs.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { useJobWatchStore } from '@/stores/jobWatchStore';
import { estimateFetchLoad } from '@/lib/watcher/fetcher';
import {
  ALERT_KINDS,
  ALERT_KIND_COLORS,
  ALERT_KIND_LABELS,
  MAX_ALERTS,
  type AlertKind,
} from '@/types/job-watch';

function formatDate(iso: string | null): string {
  if (!iso) return 'jamais collectée';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'jamais collectée';
  return date.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return 'moins d\'une seconde';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
}

export function AlertList() {
  const {
    alerts, configs, activeAlertId, setActiveAlert,
    createAlert, updateAlert, deleteAlert, duplicateAlert,
  } = useJobWatchStore();

  const [busy, setBusy] = useState(false);
  const selectedId = activeAlertId ?? alerts[0]?.id ?? null;
  const atCapacity = alerts.length >= MAX_ALERTS;
  const load = estimateFetchLoad(alerts, configs);

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () =>
    run(async () => {
      const alert = await createAlert({ name: 'Nouvelle piste', kind: 'adjacent' });
      setActiveAlert(alert.id);
    }, 'Piste créée — configurez-la ci-dessous');

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(
      `Supprimer la piste « ${name} » ?\n\nSes offres ne sont pas supprimées : celles qui ne sont plus rattachées à aucune piste restent consultables dans « Non rattachées ».`,
    )) return;
    return run(() => deleteAlert(id), 'Piste supprimée');
  };

  return (
    <section className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800">
        <div>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Mes pistes de recherche
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {alerts.length} piste{alerts.length > 1 ? 's' : ''} sur {MAX_ALERTS} — choisissez celle à configurer
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy || atCapacity}
          title={atCapacity
            ? `Limite de ${MAX_ALERTS} pistes : au-delà, la charge de collecte devient déraisonnable et les pistes se recouvrent plus qu'elles n'élargissent la recherche.`
            : undefined}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvelle piste
        </button>
      </div>

      <div className="px-4 py-4 space-y-2">
        {atCapacity && (
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
            Limite de {MAX_ALERTS} pistes atteinte. Au-delà, chaque piste supplémentaire multiplie les
            requêtes vers les sites et augmente le recouvrement, qui dégrade le signal plus qu'il
            n'élargit la recherche. Supprimez ou mettez en pause une piste pour en créer une autre.
          </p>
        )}

        {alerts.length === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Aucune piste configurée. Créez-en une pour démarrer la veille.
          </p>
        )}

        {[...alerts].sort((a, b) => a.position - b.position).map(alert => {
          const selected = alert.id === selectedId;
          const sourceCount = configs.filter(c => c.alertId === alert.id && c.enabled === 1).length;
          return (
            <div
              key={alert.id}
              className={`rounded-lg border p-3 transition-colors ${
                selected
                  ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10'
                  : 'border-gray-200 dark:border-gray-700'
              } ${alert.enabled === 0 ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setActiveAlert(alert.id)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ background: alert.color }}
                    />
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                      {alert.name}
                    </span>
                    {alert.enabled === 0 && (
                      <span className="text-[10px] uppercase tracking-wide font-bold text-gray-500 dark:text-gray-400">
                        en pause
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {ALERT_KIND_LABELS[alert.kind]} · {sourceCount} source{sourceCount > 1 ? 's' : ''} ·{' '}
                    {alert.searchProfile.jobTitles.length > 0
                      ? alert.searchProfile.jobTitles.slice(0, 3).join(', ')
                      : 'aucun intitulé visé'}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                    Dernière collecte : {formatDate(alert.lastFetchedAt)}
                  </p>
                </button>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    title={alert.enabled === 1 ? 'Mettre la piste en pause' : 'Réactiver la piste'}
                    disabled={busy}
                    onClick={() => run(
                      () => updateAlert(alert.id, { enabled: alert.enabled === 1 ? 0 : 1 }),
                      alert.enabled === 1 ? 'Piste mise en pause' : 'Piste réactivée',
                    )}
                    className="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    {alert.enabled === 1 ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    title="Dupliquer — le profil et les sources sont copiés, pas l'apprentissage"
                    disabled={busy || atCapacity}
                    onClick={() => run(() => duplicateAlert(alert.id), 'Piste dupliquée')}
                    className="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title={alerts.length <= 1 ? 'La veille doit conserver au moins une piste' : 'Supprimer la piste'}
                    disabled={busy || alerts.length <= 1}
                    onClick={() => handleDelete(alert.id, alert.name)}
                    className="p-1.5 rounded text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {selected && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                    Nom
                    <input
                      value={alert.name}
                      onChange={e => updateAlert(alert.id, { name: e.target.value })}
                      className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 text-xs w-44"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                    Rôle dans le portefeuille
                    <select
                      value={alert.kind}
                      onChange={e => {
                        const kind = e.target.value as AlertKind;
                        updateAlert(alert.id, { kind, color: ALERT_KIND_COLORS[kind] });
                      }}
                      className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 text-xs"
                    >
                      {ALERT_KINDS.map(kind => (
                        <option key={kind} value={kind}>{ALERT_KIND_LABELS[kind]}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          );
        })}

        {/* Charge de collecte — l'utilisateur doit pouvoir mesurer ce que son
            portefeuille demande aux sites avant de s'étonner d'un blocage. */}
        {load.tasks > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">
            Charge par collecte : <strong>{load.requests} requête{load.requests > 1 ? 's' : ''}</strong>
            {load.mutualised > 0 && ` (${load.mutualised} mutualisée${load.mutualised > 1 ? 's' : ''} entre pistes)`}
            {load.throttleMs > 0 && ` · ${formatDuration(load.throttleMs)} d'attente imposée entre requêtes d'une même source`}
          </p>
        )}
      </div>
    </section>
  );
}
