import { useEffect } from 'react';
import { History } from 'lucide-react';
import { useReconciliationStore } from '@/stores/reconciliationStore';

interface VariantHistoryPanelProps {
  masterEntryId: string;
}

const RESOLUTION_LABELS: Record<string, string> = {
  merged: 'Fusionné dans cette expérience',
  new_entry: 'À l\'origine de cette expérience',
};

/** Read-only append-only audit trail of CV variants that contributed to a master entry (see entry_variant_history). */
export function VariantHistoryPanel({ masterEntryId }: VariantHistoryPanelProps) {
  const { variantHistory, fetchVariantHistory } = useReconciliationStore();
  const history = variantHistory[masterEntryId];

  useEffect(() => {
    fetchVariantHistory(masterEntryId);
  }, [masterEntryId, fetchVariantHistory]);

  if (history === undefined) {
    return <p style={{ fontSize: 12, color: 'var(--rf-muted)', fontFamily: 'var(--font-body)' }}>Chargement de l'historique…</p>;
  }

  if (history.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--rf-muted)', fontFamily: 'var(--font-body)', fontStyle: 'italic' }}>
        Aucune variante synchronisée pour cette expérience.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {history.map(entry => (
        <div key={entry.id} style={{ background: 'var(--rf-surface)', border: '1px solid var(--rf-border)', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--rf-accent)', fontFamily: 'var(--font-body)' }}>
              <History size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
              {RESOLUTION_LABELS[entry.resolution] ?? entry.resolution}
            </span>
            <span style={{ fontSize: 11, color: 'var(--rf-muted)', fontFamily: 'var(--font-body)' }}>
              {new Date(entry.syncedAt).toLocaleDateString('fr-FR')}
              {entry.sourceCvName ? ` · depuis « ${entry.sourceCvName} »` : ''}
              {entry.matchScore !== null ? ` · score ${entry.matchScore}/100` : ''}
            </span>
          </div>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--rf-text)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>
            {entry.rawTitle}{entry.rawSubtitle ? ` · ${entry.rawSubtitle}` : ''}
          </p>
          {entry.rawDescription && (
            <p style={{ fontSize: 12, color: 'var(--rf-muted)', margin: 0, whiteSpace: 'pre-line', fontFamily: 'var(--font-body)' }}>
              {entry.rawDescription}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
