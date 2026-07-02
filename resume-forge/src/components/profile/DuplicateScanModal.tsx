import { useEffect, useState } from 'react';
import { X, CheckCircle2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useDuplicateScanStore } from '@/stores/duplicateScanStore';
import { buildGroupProposal, type DuplicateGroup } from '@/lib/duplicate-scan';
import { masterEntryToSnapshot, type ConsolidatedProposal } from '@/lib/experience-matching';
import { CLASSIFICATION_BADGE, CriterionTag, ExperiencePreview, ProposalForm } from '@/components/shared/experience-review';

interface DuplicateScanModalProps {
  onClose: () => void;
}

/**
 * One-off cleanup of legacy duplicates inside the master profile itself
 * (master vs master — the CV → master counterpart is ReconciliationReviewModal).
 * The scan is read-only; every merge goes through the same explicit,
 * editable-proposal validation as the reconciliation flow.
 */
export function DuplicateScanModal({ onClose }: DuplicateScanModalProps) {
  const { groups, isScanning, scan, mergeGroup, dismissGroup, removeEntryFromGroup } = useDuplicateScanStore();

  useEffect(() => {
    scan();
  }, [scan]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Doublons du profil maître</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Expériences du profil qui semblent décrire le même poste (entreprise et période proches). Aucune fusion sans votre validation.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isScanning ? (
            <p className="text-sm text-gray-500 text-center py-10">Analyse des expériences du profil…</p>
          ) : groups.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <p className="text-sm text-gray-600">Aucun doublon détecté dans le profil maître.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map(group => (
                <DuplicateGroupCard
                  key={group.id}
                  group={group}
                  onMerge={mergeGroup}
                  onDismiss={dismissGroup}
                  onRemoveEntry={removeEntryFromGroup}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  onMerge: (group: DuplicateGroup, consolidated: ConsolidatedProposal) => Promise<void>;
  onDismiss: (group: DuplicateGroup) => Promise<void>;
  onRemoveEntry: (group: DuplicateGroup, entryId: string) => Promise<void>;
}

function DuplicateGroupCard({ group, onMerge, onDismiss, onRemoveEntry }: DuplicateGroupCardProps) {
  const [proposal, setProposal] = useState<ConsolidatedProposal>(() => buildGroupProposal(group.entries));
  const [busy, setBusy] = useState<'merge' | 'dismiss' | 'remove' | null>(null);

  const badge = CLASSIFICATION_BADGE[group.classification];
  // Union of the criteria that matched across the group's pairs, same tags as the reconciliation review.
  const criteria = {
    company: group.pairs.some(p => p.score.matchedCriteria.company),
    dates: group.pairs.some(p => p.score.matchedCriteria.dates),
    title: group.pairs.some(p => p.score.matchedCriteria.title),
  };

  const handleMerge = async () => {
    setBusy('merge');
    try {
      await onMerge(group, proposal);
      toast.success(`${group.entries.length} expériences fusionnées en une seule`);
    } catch {
      toast.error('Échec de la fusion du groupe');
    } finally {
      setBusy(null);
    }
  };

  const handleDismiss = async () => {
    setBusy('dismiss');
    try {
      await onDismiss(group);
      toast.success('Groupe marqué comme non-doublon — il ne sera plus proposé');
    } catch {
      toast.error("Échec de l'action Ignorer");
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveEntry = async (entryId: string) => {
    setBusy('remove');
    try {
      await onRemoveEntry(group, entryId);
      toast.success('Expérience retirée du groupe — ce rapprochement ne sera plus proposé');
    } catch {
      toast.error('Échec du retrait');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <div>
            <p className="text-sm font-semibold text-gray-900">{group.entries[0].title}</p>
            <p className="text-xs text-gray-500">
              {group.entries[0].subtitle} · {group.entries.length} expériences similaires
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium ${badge.className}`}>
          <badge.Icon className="w-3.5 h-3.5" />
          {badge.label}
          <span className="opacity-70">· {group.overallScore}/100</span>
        </span>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {group.entries.map((entry, index) => (
          <div key={entry.id}>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                {index === 0 ? 'Expérience conservée (référence)' : `Doublon ${index}`}
              </h4>
              <button
                type="button"
                onClick={() => handleRemoveEntry(entry.id)}
                disabled={!!busy}
                className="text-[11px] text-gray-400 hover:text-red-500 hover:underline disabled:opacity-50"
              >
                Retirer (pas un doublon)
              </button>
            </div>
            <ExperiencePreview snapshot={masterEntryToSnapshot(entry)} />
          </div>
        ))}
      </div>

      <div className="px-4 pb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-gray-400 mr-1">Critères correspondants :</span>
        <CriterionTag label="Entreprise" ok={criteria.company} />
        <CriterionTag label="Dates" ok={criteria.dates} />
        <CriterionTag label="Poste (indicatif)" ok={criteria.title} />
      </div>

      <div className="p-4 border-t border-gray-100 bg-gray-50/60 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Version consolidée (éditable)</p>
          <button
            type="button"
            onClick={() => setProposal(buildGroupProposal(group.entries))}
            className="text-[11px] text-blue-600 hover:underline"
          >
            Réinitialiser la proposition
          </button>
        </div>
        <ProposalForm proposal={proposal} onChange={setProposal} />
      </div>

      <div className="p-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={!!busy}>
          Ignorer ce groupe (non-doublon)
        </Button>
        <Button variant="default" size="sm" onClick={handleMerge} disabled={!!busy}>
          Fusionner ces {group.entries.length} expériences
        </Button>
      </div>
    </div>
  );
}
