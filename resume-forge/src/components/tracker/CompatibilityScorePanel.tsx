import { useState, useEffect, useCallback } from 'react';
import { Sparkles, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useCompatibilityStore } from '@/stores/compatibilityStore';
import { useApplicationStore } from '@/stores/applicationStore';
import { AIAnalysisModal } from './AIAnalysisModal';
import type { Application } from '@/types/application';
import type { AxisScore } from '@/types/compatibility';

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

function AxisBar({ label, axis }: { label: string; axis: AxisScore }) {
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CompatibilityScorePanel({ application }: Props) {
  const { scores, fetchScore, deleteScore } = useCompatibilityStore();
  const { updateApplication } = useApplicationStore();

  const [jobDescription, setJobDescription] = useState(application.jobDescription ?? '');
  const [savingDesc, setSavingDesc] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const score = scores[application.id];
  const ai = score?.details?.aiAnalysis;

  // Keep local textarea in sync when switching between cards
  useEffect(() => {
    setJobDescription(application.jobDescription ?? '');
  }, [application.id, application.jobDescription]);

  // Load persisted score on mount
  useEffect(() => {
    fetchScore(application.id);
  }, [application.id, fetchScore]);

  const handleSaveDescription = useCallback(async () => {
    if (jobDescription === (application.jobDescription ?? '')) return;
    setSavingDesc(true);
    try {
      await updateApplication(application.id, { jobDescription: jobDescription || null });
    } finally {
      setSavingDesc(false);
    }
  }, [application.id, application.jobDescription, jobDescription, updateApplication]);

  const handleDeleteScore = useCallback(async () => {
    await deleteScore(application.id);
  }, [application.id, deleteScore]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-gray-800">Analyse IA</h3>
        </div>

        {/* No CV linked */}
        {!application.cvId && (
          <p className="text-xs text-gray-500 italic">
            Aucun CV lié à cette candidature — associe un CV pour activer l'analyse.
          </p>
        )}

        {application.cvId && (
          <>
            {/* Job description textarea */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Texte de l'annonce
              </label>
              <textarea
                value={jobDescription}
                onChange={e => setJobDescription(e.target.value)}
                onBlur={handleSaveDescription}
                placeholder="Colle ici le texte complet de l'offre d'emploi…"
                rows={4}
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-400 outline-none resize-y"
              />
              {savingDesc && <p className="text-[10px] text-gray-400 mt-0.5">Enregistrement…</p>}
            </div>

            {/* Analyse IA button */}
            <button
              onClick={() => setShowModal(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 transition-colors"
            >
              <Sparkles size={14} />
              {score ? 'Relancer l\'analyse IA' : 'Analyser avec l\'IA'}
            </button>
          </>
        )}

        {/* Score display — only shown after AI analysis */}
        {score && ai && (
          <>
            {/* Global score */}
            <div className={`flex items-center justify-between px-4 py-3 rounded-lg border ${scoreBgColor(score.scoreGlobal)}`}>
              <div>
                <p className="text-xs font-medium text-gray-500">Score global</p>
                <p className="text-[10px] text-gray-400 flex items-center gap-1">
                  <Sparkles size={9} className="text-indigo-400" />
                  Analysé par IA le {new Date(score.computedAt).toLocaleDateString('fr-FR')}
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

            {/* AI synthesis */}
            {ai.summary && (
              <p className="text-xs text-gray-600 italic border-l-2 border-indigo-200 pl-3">
                {ai.summary}
              </p>
            )}

            {/* Expandable details */}
            <button
              onClick={() => setShowDetails(v => !v)}
              className="w-full flex items-center justify-between text-xs font-semibold text-gray-700 hover:text-indigo-600 transition-colors"
            >
              <span>Détails de l'analyse</span>
              {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showDetails && (
              <div className="space-y-4">
                {/* Points forts */}
                {ai.strengths.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-green-700 mb-1.5 flex items-center gap-1">
                      <CheckCircle2 size={11} /> Points forts
                    </p>
                    <ul className="space-y-1">
                      {ai.strengths.map((s, i) => (
                        <li key={i} className="text-[11px] text-gray-700 flex items-start gap-1.5">
                          <CheckCircle2 size={10} className="text-green-500 mt-0.5 flex-shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Points de friction */}
                {ai.frictionPoints.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                      <AlertCircle size={11} /> Points de friction
                    </p>
                    <ul className="space-y-1">
                      {ai.frictionPoints.map((f, i) => (
                        <li key={i} className="text-[11px] text-gray-700 flex items-start gap-1.5">
                          <AlertCircle size={10} className="text-amber-500 mt-0.5 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommandations */}
                {ai.recommendations.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-indigo-700 mb-1.5">Recommandations</p>
                    <ul className="space-y-1">
                      {ai.recommendations.map((r, i) => (
                        <li key={i} className="text-[11px] text-gray-700 flex items-start gap-1.5">
                          <span className="text-indigo-400 font-bold flex-shrink-0">{i + 1}.</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Mots-clés */}
                {(ai.missingKeywords.length > 0 || ai.presentKeywords.length > 0) && (
                  <div className="space-y-2">
                    {ai.missingKeywords.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-red-600 mb-1">
                          Mots-clés manquants
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {ai.missingKeywords.map(kw => (
                            <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {ai.presentKeywords.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-green-600 mb-1">
                          Mots-clés présents
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {ai.presentKeywords.map(kw => (
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
              </div>
            )}

            {/* Reset */}
            <button
              onClick={handleDeleteScore}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] text-gray-400 hover:text-red-500 transition-colors"
            >
              <RefreshCw size={10} />
              Supprimer l'analyse
            </button>
          </>
        )}

        {/* Score exists but is from local algorithm (no aiAnalysis field) — upgrade notice */}
        {score && !ai && (
          <div className="text-[11px] text-gray-500 bg-white border border-dashed border-gray-200 rounded px-3 py-2">
            Un score local existe pour cette candidature. Relance une analyse IA pour le remplacer.
          </div>
        )}
      </div>

      {showModal && (
        <AIAnalysisModal
          application={application}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
