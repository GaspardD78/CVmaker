/**
 * Barre de pistes — navigation entre les explorations du portefeuille.
 *
 * Elle rend le portefeuille lisible : sans elle, quatre pistes produisent une
 * liste d'offres indifférenciée dans laquelle il devient impossible de juger
 * ce que chaque exploration rapporte réellement.
 */

import { useJobWatchStore } from '@/stores/jobWatchStore';
import { ALERT_KIND_LABELS } from '@/types/job-watch';

export function AlertBar() {
  const alerts = useJobWatchStore(s => s.alerts);
  const filters = useJobWatchStore(s => s.filters);
  const setFilters = useJobWatchStore(s => s.setFilters);
  const setActiveAlert = useJobWatchStore(s => s.setActiveAlert);
  const offers = useJobWatchStore(s => s.offers);

  // Une seule piste : la barre n'apporte rien, elle encombrerait la vue.
  if (alerts.length < 2) return null;

  const unreadFor = (alertId: string) =>
    offers.filter(o => o.isRead === 0 && o.isArchived === 0 && o.alerts.some(l => l.alertId === alertId)).length;
  const unreadAll = offers.filter(o => o.isRead === 0 && o.isArchived === 0).length;
  const unlinkedCount = offers.filter(o => o.isArchived === 0 && o.alerts.length === 0).length;

  const select = (id: string | null | 'unlinked') => {
    setFilters({ alertId: id });
    setActiveAlert(typeof id === 'string' && id !== 'unlinked' ? id : null);
  };

  const chip = (
    key: string,
    label: string,
    selected: boolean,
    color: string | null,
    count: number,
    onClick: () => void,
    title?: string,
  ) => (
    <button
      key={key}
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 99,
        fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-body)',
        cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
        border: `1px solid ${selected ? (color ?? 'var(--rf-accent)') : 'var(--rf-border)'}`,
        background: selected ? `${color ?? '#6366f1'}1f` : 'transparent',
        color: selected ? (color ?? 'var(--rf-accent)') : 'var(--rf-muted)',
      }}
    >
      {color && (
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      )}
      {label}
      {count > 0 && (
        <span style={{
          background: selected ? 'rgba(255,255,255,.25)' : 'var(--rf-hover)',
          borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '1px 5px',
        }}>{count}</span>
      )}
    </button>
  );

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {chip('all', 'Toutes les pistes', filters.alertId === null, null, unreadAll, () => select(null))}

      {[...alerts].sort((a, b) => a.position - b.position).map(alert =>
        chip(
          alert.id,
          alert.name,
          filters.alertId === alert.id,
          alert.color,
          unreadFor(alert.id),
          () => select(alert.id),
          `${ALERT_KIND_LABELS[alert.kind]}${alert.enabled === 0 ? ' · piste en pause' : ''}`,
        ),
      )}

      {/* Les offres qui ont perdu leur dernière piste restent consultables :
          supprimer une exploration ne doit pas faire disparaître son butin. */}
      {unlinkedCount > 0 &&
        chip('unlinked', 'Non rattachées', filters.alertId === 'unlinked', '#6b7280', unlinkedCount, () => select('unlinked'))}
    </div>
  );
}
