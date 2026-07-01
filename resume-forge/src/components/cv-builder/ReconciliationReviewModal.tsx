import { useEffect, useState } from 'react';
import { X, CheckCircle2, HelpCircle, ShieldQuestion } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useReconciliationStore } from '@/stores/reconciliationStore';
import {
  buildConsolidatedProposal,
  buildNewEntryProposal,
  masterEntryToSnapshot,
  type ConsolidatedProposal,
  type ExperienceSnapshot,
  type SyncCandidate,
  type MatchClassification,
} from '@/lib/experience-matching';
import type { MasterEntry } from '@/types/profile';

interface ReconciliationReviewModalProps {
  cvId: string;
  cvName: string;
  onClose: () => void;
}

const CLASSIFICATION_BADGE: Record<MatchClassification, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  confident: { label: 'Correspondance probable', className: 'bg-green-50 text-green-700 border-green-200', Icon: CheckCircle2 },
  ambiguous: { label: 'À confirmer', className: 'bg-amber-50 text-amber-700 border-amber-200', Icon: ShieldQuestion },
  none: { label: 'Aucune correspondance nette', className: 'bg-gray-100 text-gray-600 border-gray-200', Icon: HelpCircle },
};

export function ReconciliationReviewModal({ cvId, cvName, onClose }: ReconciliationReviewModalProps) {
  const { candidates, isLoading, loadCandidates, mergeCandidate, createAsNewEntry, ignoreCandidate } = useReconciliationStore();

  useEffect(() => {
    loadCandidates(cvId);
  }, [cvId, loadCandidates]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Synchroniser vers le profil maître</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Expériences adaptées dans « {cvName} » qui diffèrent de leur version dans le profil maître.
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
          {isLoading ? (
            <p className="text-sm text-gray-500 text-center py-10">Analyse des expériences…</p>
          ) : candidates.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <p className="text-sm text-gray-600">Rien à synchroniser — le profil maître est déjà à jour avec ce CV.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {candidates.map(candidate => (
                <CandidateCard
                  key={candidate.blockId}
                  candidate={candidate}
                  cvId={cvId}
                  cvName={cvName}
                  onMerge={mergeCandidate}
                  onCreateNew={createAsNewEntry}
                  onIgnore={ignoreCandidate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExperiencePreview({ snapshot }: { snapshot: ExperienceSnapshot }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm h-full">
      <p className="font-semibold text-gray-900">{snapshot.title}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        {snapshot.subtitle}
        {snapshot.datesOverrideText
          ? ` · ${snapshot.datesOverrideText}`
          : ` · ${snapshot.startDate ?? '?'} — ${snapshot.isCurrent ? "aujourd'hui" : (snapshot.endDate ?? '?')}`}
      </p>
      {snapshot.description && (
        <p className="text-xs text-gray-600 mt-2 whitespace-pre-line line-clamp-6">{snapshot.description}</p>
      )}
    </div>
  );
}

function CriterionTag({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] ${
      ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-400'
    }`}>
      {label}
    </span>
  );
}

interface CandidateCardProps {
  candidate: SyncCandidate;
  cvId: string;
  cvName: string;
  onMerge: (candidate: SyncCandidate, consolidated: ConsolidatedProposal, cvId: string, cvName: string) => Promise<void>;
  onCreateNew: (candidate: SyncCandidate, consolidated: ConsolidatedProposal, cvId: string, cvName: string) => Promise<void>;
  onIgnore: (candidate: SyncCandidate) => Promise<void>;
}

function CandidateCard({ candidate, cvId, cvName, onMerge, onCreateNew, onIgnore }: CandidateCardProps) {
  const targetEntry: MasterEntry = candidate.bestMatch?.entry ?? candidate.linkedEntry;
  const [proposal, setProposal] = useState<ConsolidatedProposal>(() => buildConsolidatedProposal(targetEntry, candidate.adapted));
  const [busy, setBusy] = useState<'merge' | 'new' | 'ignore' | null>(null);

  const classification: MatchClassification = candidate.bestMatch?.score.classification ?? 'none';
  const badge = CLASSIFICATION_BADGE[classification];
  const criteria = candidate.bestMatch?.score.matchedCriteria;

  const setField = <K extends keyof ConsolidatedProposal>(key: K, value: ConsolidatedProposal[K]) =>
    setProposal(p => ({ ...p, [key]: value }));

  const handleMerge = async () => {
    setBusy('merge');
    try {
      await onMerge(candidate, proposal, cvId, cvName);
      toast.success('Expérience fusionnée dans le profil maître');
    } catch {
      toast.error('Échec de la fusion');
    } finally {
      setBusy(null);
    }
  };

  const handleCreateNew = async () => {
    setBusy('new');
    try {
      await onCreateNew(candidate, proposal, cvId, cvName);
      toast.success('Nouvelle expérience créée dans le profil maître');
    } catch {
      toast.error('Échec de la création de la nouvelle expérience');
    } finally {
      setBusy(null);
    }
  };

  const handleIgnore = async () => {
    setBusy('ignore');
    try {
      await onIgnore(candidate);
    } catch {
      toast.error("Échec de l'action Ignorer");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{targetEntry.title}</p>
          <p className="text-xs text-gray-500">{targetEntry.subtitle}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium ${badge.className}`}>
          <badge.Icon className="w-3.5 h-3.5" />
          {badge.label}
          {candidate.bestMatch && <span className="opacity-70">· {candidate.bestMatch.score.overallScore}/100</span>}
        </span>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Profil maître (actuel)</h4>
          <ExperiencePreview snapshot={masterEntryToSnapshot(targetEntry)} />
        </div>
        <div>
          <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Version dans « {cvName} »</h4>
          <ExperiencePreview snapshot={candidate.adapted} />
        </div>
      </div>

      {criteria && (
        <div className="px-4 pb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-gray-400 mr-1">Critères correspondants :</span>
          <CriterionTag label="Entreprise" ok={criteria.company} />
          <CriterionTag label="Dates" ok={criteria.dates} />
          <CriterionTag label="Poste (indicatif)" ok={criteria.title} />
        </div>
      )}

      <div className="p-4 border-t border-gray-100 bg-gray-50/60 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Proposition de fusion (éditable)</p>
          <button
            type="button"
            onClick={() => setProposal(buildNewEntryProposal(candidate))}
            className="text-[11px] text-blue-600 hover:underline"
          >
            Repartir de la version du CV
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={proposal.title}
            onChange={e => setField('title', e.target.value)}
            placeholder="Poste"
            className="w-full text-sm rounded-md border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            value={proposal.subtitle ?? ''}
            onChange={e => setField('subtitle', e.target.value)}
            placeholder="Entreprise"
            className="w-full text-sm rounded-md border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            value={proposal.startDate ?? ''}
            onChange={e => setField('startDate', e.target.value)}
            placeholder="Début (YYYY-MM)"
            className="w-full text-sm rounded-md border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            value={proposal.endDate ?? ''}
            onChange={e => setField('endDate', e.target.value)}
            placeholder="Fin (YYYY-MM)"
            disabled={proposal.isCurrent}
            className="w-full text-sm rounded-md border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={proposal.isCurrent} onChange={e => setField('isCurrent', e.target.checked)} />
          En cours
        </label>
        <textarea
          value={proposal.description ?? ''}
          onChange={e => setField('description', e.target.value)}
          rows={5}
          placeholder="Description consolidée"
          className="w-full text-sm rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
        />
      </div>

      <div className="p-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={handleIgnore} disabled={!!busy}>
          Ignorer
        </Button>
        <Button variant={classification === 'none' ? 'default' : 'outline'} size="sm" onClick={handleCreateNew} disabled={!!busy}>
          Traiter comme nouvelle expérience
        </Button>
        <Button variant={classification === 'none' ? 'outline' : 'default'} size="sm" onClick={handleMerge} disabled={!!busy}>
          Valider la fusion
        </Button>
      </div>
    </div>
  );
}
