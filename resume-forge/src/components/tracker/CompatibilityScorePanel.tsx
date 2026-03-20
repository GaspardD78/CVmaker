import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Sparkles, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useCompatibilityStore } from '@/stores/compatibilityStore';
import { useApplicationStore } from '@/stores/applicationStore';
import { useCvStore } from '@/stores/cvStore';
import { useProfileStore } from '@/stores/profileStore';
import { usePromptStore } from '@/stores/promptStore';
import type { Application } from '@/types/application';
import type { Advice, AxisScore } from '@/types/compatibility';

interface Props {
  application: Application;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-red-600';
}

function scoreBarColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

function scoreBgColor(score: number): string {
  if (score >= 70) return 'bg-green-50 border-green-200';
  if (score >= 40) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}

function severityIcon(advice: Advice) {
  if (advice.severity === 'high')   return <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />;
  if (advice.severity === 'medium') return <AlertCircle size={14} className="text-yellow-500 flex-shrink-0 mt-0.5" />;
  return <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />;
}

function AxisBar({ label, axis }: { label: string; axis: AxisScore }) {
  const total = axis.matched.length + axis.missing.length;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-600">{label}</span>
        <span className={`text-xs font-semibold ${scoreColor(axis.score)}`}>{axis.score}%</span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreBarColor(axis.score)}`}
          style={{ width: `${axis.score}%` }}
        />
      </div>
      {total > 0 && (
        <p className="text-[10px] text-gray-400 mt-0.5">
          {axis.matched.length}/{total} mots-clés couverts
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CompatibilityScorePanel({ application }: Props) {
  const { scores, computing, fetchScore, computeAndSave, isStale } = useCompatibilityStore();
  const { updateApplication } = useApplicationStore();
  const { fetchCvBlocks, currentCvBlocks } = useCvStore();
  const { entries, fetchProfile } = useProfileStore();
  const { setJobOffer, selectTemplate } = usePromptStore();

  const [jobDescription, setJobDescription] = useState(application.jobDescription ?? '');
  const [showAdvice, setShowAdvice] = useState(false);
  const [savingDesc, setSavingDesc] = useState(false);

  // Track which cvId the blocks were last fetched for
  const fetchedCvIdRef = useRef<string | null>(null);

  const score = scores[application.id];
  const isComputing = computing[application.id] ?? false;

  // Keep local state in sync when application changes (e.g. another card opened)
  useEffect(() => {
    setJobDescription(application.jobDescription ?? '');
  }, [application.id, application.jobDescription]);

  // Fetch persisted score + CV blocks + profile entries on mount
  useEffect(() => {
    fetchScore(application.id);
    fetchProfile();
  }, [application.id, fetchScore, fetchProfile]);

  useEffect(() => {
    if (application.cvId && fetchedCvIdRef.current !== application.cvId) {
      fetchedCvIdRef.current = application.cvId;
      fetchCvBlocks(application.cvId);
    }
  }, [application.cvId, fetchCvBlocks]);

  // -------------------------------------------------------------------------
  // Save job description (on blur)
  // -------------------------------------------------------------------------
  const handleSaveDescription = useCallback(async () => {
    if (jobDescription === (application.jobDescription ?? '')) return;
    setSavingDesc(true);
    try {
      await updateApplication(application.id, { jobDescription: jobDescription || null });
    } finally {
      setSavingDesc(false);
    }
  }, [application.id, application.jobDescription, jobDescription, updateApplication]);

  // -------------------------------------------------------------------------
  // Compute score
  // -------------------------------------------------------------------------
  const handleCompute = useCallback(async () => {
    if (!application.cvId) {
      toast.error('Aucun CV lié à cette candidature.');
      return;
    }
    if (!jobDescription.trim()) {
      toast.error('Colle le texte de l\'annonce avant de calculer.');
      return;
    }
    // Ensure description is saved first
    await updateApplication(application.id, { jobDescription: jobDescription || null });
    try {
      await computeAndSave(application.id, application.cvId, jobDescription, currentCvBlocks, entries);
      toast.success('Score calculé.');
    } catch {
      toast.error('Erreur lors du calcul du score.');
    }
  }, [application.id, application.cvId, jobDescription, currentCvBlocks, entries, computeAndSave, updateApplication]);

  // -------------------------------------------------------------------------
  // "Approfondir avec l'IA" — inject job description into prompt store
  // -------------------------------------------------------------------------
  const handleDeepDive = useCallback(() => {
    if (!jobDescription.trim()) {
      toast.error('Pas de texte d\'annonce à transmettre.');
      return;
    }
    setJobOffer(jobDescription);
    selectTemplate('ats-keywords');
    toast.success('Annonce injectée dans le panneau IA — ouvre ton CV pour continuer.', { duration: 4000 });
  }, [jobDescription, setJobOffer, selectTemplate]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------
  const stale = score && application.cvId
    ? isStale(application.id, jobDescription, currentCvBlocks, entries)
    : false;

  const topMissing = score
    ? [...score.details.axes.keywords.missing]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5)
        .map(m => m.jobTerm)
    : [];

  const topMatched = score
    ? [...score.details.axes.keywords.matched]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5)
        .map(m => m.jobTerm)
    : [];

  const highAdvice   = score?.details.advice.filter(a => a.severity === 'high')   ?? [];
  const mediumAdvice = score?.details.advice.filter(a => a.severity === 'medium') ?? [];
  const lowAdvice    = score?.details.advice.filter(a => a.severity === 'low')    ?? [];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-indigo-500" />
        <h3 className="text-sm font-bold text-gray-800">Score de compatibilité</h3>
      </div>

      {/* No CV linked */}
      {!application.cvId && (
        <p className="text-xs text-gray-500 italic">
          Aucun CV lié à cette candidature — associe un CV pour activer le scoring.
        </p>
      )}

      {/* Job description textarea */}
      {application.cvId && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Texte de l'annonce
            </label>
            <textarea
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              onBlur={handleSaveDescription}
              placeholder="Colle ici le texte complet de l'offre d'emploi…"
              rows={5}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none resize-y"
            />
            {savingDesc && <p className="text-[10px] text-gray-400 mt-0.5">Enregistrement…</p>}
          </div>

          {/* Compute button */}
          <button
            onClick={handleCompute}
            disabled={isComputing || !jobDescription.trim()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isComputing
              ? <><RefreshCw size={14} className="animate-spin" /> Calcul en cours…</>
              : score
              ? <><RefreshCw size={14} /> Recalculer</>
              : <><Sparkles size={14} /> Calculer le score</>}
          </button>
        </>
      )}

      {/* Score display */}
      {score && (
        <>
          {/* Stale warning */}
          {stale && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              <AlertCircle size={12} />
              Le CV ou l'annonce a changé — recalcule le score pour le mettre à jour.
            </div>
          )}

          {/* Global score */}
          <div className={`flex items-center justify-between px-4 py-3 rounded-lg border ${scoreBgColor(score.scoreGlobal)}`}>
            <div>
              <p className="text-xs font-medium text-gray-500">Score global</p>
              <p className="text-[10px] text-gray-400">
                Calculé le {new Date(score.computedAt).toLocaleDateString('fr-FR')}
              </p>
            </div>
            <span className={`text-3xl font-bold tabular-nums ${scoreColor(score.scoreGlobal)}`}>
              {score.scoreGlobal}%
            </span>
          </div>

          {/* Axis breakdown */}
          <div className="space-y-3">
            <AxisBar label="Compétences"   axis={score.details.axes.skills} />
            <AxisBar label="Expériences"   axis={score.details.axes.experience} />
            <AxisBar label="Formation"     axis={score.details.axes.education} />
            <AxisBar label="Couverture CV" axis={score.details.axes.keywords} />
          </div>

          {/* Keywords summary */}
          {(topMissing.length > 0 || topMatched.length > 0) && (
            <div className="space-y-2">
              {topMissing.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-red-600 mb-1">
                    Mots-clés manquants (top {topMissing.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {topMissing.map(kw => (
                      <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {topMatched.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-green-600 mb-1">
                    Points forts détectés
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {topMatched.map(kw => (
                      <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                        <CheckCircle2 size={9} className="inline mr-0.5" />
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Advice accordion */}
          {score.details.advice.length > 0 && (
            <div>
              <button
                onClick={() => setShowAdvice(v => !v)}
                className="w-full flex items-center justify-between text-xs font-semibold text-gray-700 hover:text-indigo-600 transition-colors"
              >
                <span>
                  Conseils ({score.details.advice.length})
                  {highAdvice.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px]">
                      {highAdvice.length} prioritaire{highAdvice.length > 1 ? 's' : ''}
                    </span>
                  )}
                </span>
                {showAdvice ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showAdvice && (
                <div className="mt-2 space-y-1.5">
                  {[...highAdvice, ...mediumAdvice, ...lowAdvice].map((advice, i) => (
                    <div key={i} className="flex gap-2 text-[11px] text-gray-700 bg-white border border-gray-100 rounded px-2 py-1.5">
                      {severityIcon(advice)}
                      <span>{advice.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI deep dive */}
          <button
            onClick={handleDeepDive}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-50 transition-colors"
          >
            <Sparkles size={12} />
            Approfondir avec l'IA (panneau IA)
          </button>
        </>
      )}
    </div>
  );
}
