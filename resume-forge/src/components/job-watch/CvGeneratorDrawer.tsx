import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Copy, Check, FileText, Mail, ChevronRight, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { useProfileStore } from '@/stores/profileStore';
import { useCvStore } from '@/stores/cvStore';
import { generateFullCVMatchPrompt, generateCoverLetterPrompt } from '@/lib/prompt-templates';
import type { JobOffer } from '@/types/job-watch';
import type { CVBlock } from '@/types/cv';

// ---------------------------------------------------------------------------

interface CvGeneratorDrawerProps {
  offer: JobOffer | null;
  onClose: () => void;
}

type Tab = 'master' | 'existing' | 'cover';

// ---------------------------------------------------------------------------

export function CvGeneratorDrawer({ offer, onClose }: CvGeneratorDrawerProps) {
  const { profile, entries } = useProfileStore();
  const { cvs, fetchCvs, duplicateCv } = useCvStore();

  const [activeTab, setActiveTab] = useState<Tab>('master');
  const [selectedCvId, setSelectedCvId] = useState<string>('');
  const [jsonInput, setJsonInput] = useState('');
  const [mdInput, setMdInput] = useState('');
  const [coverContactName, setCoverContactName] = useState('');
  const [coverStyle, setCoverStyle] = useState<'formal' | 'direct'>('direct');
  const [promptCopied, setPromptCopied] = useState(false);
  const [cvPromptCopied, setCvPromptCopied] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const open = offer !== null;

  // Fetch CVs list when drawer opens
  useEffect(() => {
    if (open) {
      fetchCvs();
      // Reset state on each new offer
      setActiveTab('master');
      setJsonInput('');
      setMdInput('');
      setPromptCopied(false);
      setCvPromptCopied(false);
    }
  }, [open, offer?.id, fetchCvs]);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) onClose();
    };
    if (open) {
      const id = setTimeout(() => document.addEventListener('mousedown', handler), 50);
      return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
    }
  }, [open, onClose]);

  if (!offer || !profile) return null;

  const offerText = [
    offer.title,
    offer.company,
    offer.location,
    offer.contractType,
    offer.descriptionSnippet,
  ].filter(Boolean).join('\n');

  // ── Prompt generators ────────────────────────────────────────────────────

  const getMasterPrompt = () => generateFullCVMatchPrompt(profile, entries, offerText, offer.company || undefined);

  const getExistingCvPrompt = () => {
    // Same prompt as master but scoped to entries visible in the selected CV
    // (we still use the master entries — the AI will handle selection from the CV)
    return generateFullCVMatchPrompt(profile, entries, offerText, offer.company || undefined);
  };

  const getCoverPrompt = () =>
    generateCoverLetterPrompt(profile, entries, offerText, {
      contactName: coverContactName || undefined,
      style: coverStyle,
    });

  // ── Clipboard helpers ────────────────────────────────────────────────────

  const copyPrompt = async (getter: () => string, setFlag: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(getter());
      setFlag(true);
      setTimeout(() => setFlag(false), 2000);
      toast.success('Prompt copié dans le presse-papier');
    } catch {
      toast.error('Erreur lors de la copie');
    }
  };

  // ── Import handlers ──────────────────────────────────────────────────────

  const handleApplyMasterJson = async () => {
    if (!jsonInput.trim()) { toast.error('Collez le JSON généré par l\'IA'); return; }
    setIsApplying(true);
    try {
      const clean = jsonInput.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(clean) as {
        title?: string;
        summary?: string;
        entries?: { id: string; visible: boolean; description?: string }[];
      };

      // 1. Create a brand-new CV from the master profile
      const cvName = data.title || `${offer.title} (IA)`;
      await useCvStore.getState().createCv({
        name: cvName,
        profileId: profile.id,
        templateId: 'classic',
        targetJob: data.title ?? offer.title,
        targetCompany: offer.company ?? null,
        customSummary: data.summary ?? null,
        settings: {},
        isFavorite: false,
        lastExported: null,
        markdownContent: null,
        markdownMode: 0,
      });

      // 2. Get the newly created CV (first in list after refresh)
      await useCvStore.getState().fetchCvs();
      const refreshedCvs = useCvStore.getState().cvs;
      const newCv = refreshedCvs[0]; // createCv orders by updated_at DESC
      if (!newCv) throw new Error('CV non créé');

      // 3. Apply AI entry overrides on the new CV's blocks
      if (data.entries && Array.isArray(data.entries)) {
        await useCvStore.getState().fetchCvBlocks(newCv.id);
        const blocks = useCvStore.getState().currentCvBlocks;
        for (const aiEntry of data.entries) {
          const block = blocks.find(b => b.entryId === aiEntry.id);
          if (!block) continue;
          if (aiEntry.visible === false) {
            await useCvStore.getState().updateCvBlock(block.id, { isVisible: false });
          } else {
            await useCvStore.getState().updateCvBlock(block.id, { isVisible: true, overrideData: aiEntry.description !== undefined ? { ...block.overrideData, description: aiEntry.description } : block.overrideData } as Partial<CVBlock>);
          }
        }
      }

      toast.success(
        <span>
          CV <strong>{cvName}</strong> créé avec succès !{' '}
          <a href={`/cv/${newCv.id}`} className="underline font-semibold">Ouvrir →</a>
        </span>,
        { duration: 8000 }
      );
      setJsonInput('');
      onClose();
    } catch (err) {
      if (err instanceof SyntaxError) {
        toast.error('JSON invalide. Vérifiez le format.');
      } else {
        toast.error(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`);
      }
    } finally {
      setIsApplying(false);
    }
  };

  const handleApplyExistingJson = async () => {
    if (!selectedCvId) { toast.error('Sélectionnez un CV à dupliquer'); return; }
    if (!jsonInput.trim()) { toast.error('Collez le JSON généré par l\'IA'); return; }
    setIsApplying(true);
    try {
      const clean = jsonInput.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(clean) as {
        title?: string;
        summary?: string;
        entries?: { id: string; visible: boolean; description?: string }[];
      };

      // 1. Duplicate the selected CV
      await duplicateCv(selectedCvId);
      await useCvStore.getState().fetchCvs();
      const refreshedCvs = useCvStore.getState().cvs;
      const newCv = refreshedCvs[0];
      if (!newCv) throw new Error('CV non créé');

      // 2. Rename + apply summary
      const cvName = data.title || `${offer.title} (IA)`;
      await useCvStore.getState().updateCv(newCv.id, {
        name: cvName,
        targetJob: data.title ?? offer.title,
        customSummary: data.summary ?? null,
      });

      // 3. Apply entry overrides
      if (data.entries && Array.isArray(data.entries)) {
        await useCvStore.getState().fetchCvBlocks(newCv.id);
        const blocks = useCvStore.getState().currentCvBlocks;
        for (const aiEntry of data.entries) {
          const block = blocks.find(b => b.entryId === aiEntry.id);
          if (!block) continue;
          if (aiEntry.visible === false) {
            await useCvStore.getState().updateCvBlock(block.id, { isVisible: false });
          } else {
            await useCvStore.getState().updateCvBlock(block.id, { isVisible: true, overrideData: aiEntry.description !== undefined ? { ...block.overrideData, description: aiEntry.description } : block.overrideData } as Partial<CVBlock>);
          }
        }
      }

      toast.success(
        <span>
          CV <strong>{cvName}</strong> créé !{' '}
          <a href={`/cv/${newCv.id}`} className="underline font-semibold">Ouvrir →</a>
        </span>,
        { duration: 8000 }
      );
      setJsonInput('');
      onClose();
    } catch (err) {
      if (err instanceof SyntaxError) {
        toast.error('JSON invalide. Vérifiez le format.');
      } else {
        toast.error(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`);
      }
    } finally {
      setIsApplying(false);
    }
  };

  const handleCopyCoverLetter = async () => {
    if (!mdInput.trim()) { toast.error('Collez la lettre générée par l\'IA'); return; }
    try {
      await navigator.clipboard.writeText(mdInput);
      toast.success('Lettre copiée dans le presse-papier');
    } catch {
      toast.error('Erreur de copie');
    }
  };

  // ── Shared step component ─────────────────────────────────────────────────

  const StepLabel = ({ n, label }: { n: number; label: string }) => (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
        {n}
      </span>
      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{label}</span>
    </div>
  );

  const CopyBtn = ({
    copied,
    onCopy,
    label = 'Copier le prompt',
  }: {
    copied: boolean;
    onCopy: () => void;
    label?: string;
  }) => (
    <button
      onClick={onCopy}
      className={`w-full py-2 flex items-center justify-center gap-2 text-sm font-semibold rounded-lg border transition-colors ${
        copied
          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700'
          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? 'Prompt copié !' : label}
    </button>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[58] bg-black/30 dark:bg-black/50 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Générateur de CV ciblé"
        className={`fixed top-0 right-0 z-[59] h-full w-full sm:w-[520px] max-w-full
          bg-white dark:bg-gray-900
          border-l border-gray-200 dark:border-gray-700
          shadow-2xl shadow-black/30
          flex flex-col
          transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)]
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-0.5">
              <Sparkles className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 tracking-tight">
                Générer un CV ciblé
              </h2>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {offer.title}{offer.company ? ` · ${offer.company}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────── */}
        <div className="flex border-b border-gray-100 dark:border-gray-700 flex-shrink-0 px-1">
          {([
            { id: 'master',   icon: <Wand2 className="w-3.5 h-3.5" />,    label: 'Profil maître' },
            { id: 'existing', icon: <FileText className="w-3.5 h-3.5" />, label: 'CV existant' },
            { id: 'cover',    icon: <Mail className="w-3.5 h-3.5" />,     label: 'Lettre' },
          ] as { id: Tab; icon: React.ReactNode; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Body ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── Tab: Profil maître ──────────────────────────────────── */}
          {activeTab === 'master' && (
            <>
              <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 px-3 py-2.5 text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
                L'IA va sélectionner et adapter les meilleures entrées de <strong>toutes vos expériences</strong> pour créer un CV sur-mesure pour cette offre.
              </div>

              {/* Step 1 */}
              <div>
                <StepLabel n={1} label="Copier le prompt d'analyse" />
                <CopyBtn
                  copied={promptCopied}
                  onCopy={() => copyPrompt(getMasterPrompt, setPromptCopied)}
                  label="Copier le prompt CV (profil complet)"
                />
              </div>

              {/* Step 2 */}
              <div>
                <StepLabel n={2} label="Collez le JSON retourné par l'IA" />
                <textarea
                  value={jsonInput}
                  onChange={e => setJsonInput(e.target.value)}
                  placeholder={'{"title": "...", "summary": "...", "entries": [...]}'}
                  rows={10}
                  className="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-mono text-gray-700 dark:text-gray-300 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-indigo-500"
                />
              </div>

              {/* Step 3 */}
              <div>
                <StepLabel n={3} label="Créer le nouveau CV" />
                <button
                  onClick={handleApplyMasterJson}
                  disabled={isApplying || !jsonInput.trim()}
                  className="w-full py-2.5 flex items-center justify-center gap-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white transition-colors shadow-sm"
                >
                  {isApplying ? (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {isApplying ? 'Création en cours…' : 'Créer le CV ciblé'}
                </button>
              </div>
            </>
          )}

          {/* ── Tab: CV existant ───────────────────────────────────── */}
          {activeTab === 'existing' && (
            <>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                Le CV sélectionné sera <strong>dupliqué</strong>, puis les modifications IA seront appliquées sur la copie. L'original n'est pas modifié.
              </div>

              {/* CV selector */}
              <div>
                <StepLabel n={1} label="Choisir le CV à dupliquer" />
                {cvs.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Aucun CV trouvé. Créez-en un d'abord.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {cvs.map(cv => (
                      <label
                        key={cv.id}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selectedCvId === cv.id
                            ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name="cv-select"
                          value={cv.id}
                          checked={selectedCvId === cv.id}
                          onChange={() => setSelectedCvId(cv.id)}
                          className="accent-indigo-500 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{cv.name}</p>
                          {cv.targetJob && (
                            <p className="text-[10px] text-gray-400 truncate">{cv.targetJob}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 2 */}
              <div>
                <StepLabel n={2} label="Copier le prompt d'analyse" />
                <CopyBtn
                  copied={cvPromptCopied}
                  onCopy={() => copyPrompt(getExistingCvPrompt, setCvPromptCopied)}
                  label="Copier le prompt CV (profil complet)"
                />
              </div>

              {/* Step 3 */}
              <div>
                <StepLabel n={3} label="Coller le JSON retourné par l'IA" />
                <textarea
                  value={jsonInput}
                  onChange={e => setJsonInput(e.target.value)}
                  placeholder={'{"title": "...", "summary": "...", "entries": [...]}'}
                  rows={8}
                  className="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-mono text-gray-700 dark:text-gray-300 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {/* Step 4 */}
              <div>
                <StepLabel n={4} label="Dupliquer et créer le CV ciblé" />
                <button
                  onClick={handleApplyExistingJson}
                  disabled={isApplying || !jsonInput.trim() || !selectedCvId}
                  className="w-full py-2.5 flex items-center justify-center gap-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white transition-colors shadow-sm"
                >
                  {isApplying ? (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  {isApplying ? 'Création en cours…' : 'Dupliquer et appliquer'}
                </button>
              </div>
            </>
          )}

          {/* ── Tab: Lettre de motivation ──────────────────────────── */}
          {activeTab === 'cover' && (
            <>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                Génère une <strong>lettre de motivation en Markdown</strong>, factuelle et sans clichés, adaptée à cette offre.
              </div>

              {/* Options */}
              <div>
                <StepLabel n={1} label="Personnaliser le prompt (optionnel)" />
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Nom du contact (optionnel)</label>
                    <input
                      type="text"
                      value={coverContactName}
                      onChange={e => setCoverContactName(e.target.value)}
                      placeholder="Ex: Marie Dupont"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Style</label>
                    <div className="flex gap-2">
                      {(['direct', 'formal'] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => setCoverStyle(s)}
                          className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            coverStyle === s
                              ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                              : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          {s === 'direct' ? 'Direct (recommandé)' : 'Formel'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div>
                <StepLabel n={2} label="Copier le prompt lettre" />
                <CopyBtn
                  copied={promptCopied}
                  onCopy={() => copyPrompt(getCoverPrompt, setPromptCopied)}
                  label="Copier le prompt lettre de motivation"
                />
              </div>

              {/* Step 3 */}
              <div>
                <StepLabel n={3} label="Coller la réponse de l'IA (Markdown)" />
                <textarea
                  value={mdInput}
                  onChange={e => setMdInput(e.target.value)}
                  placeholder="Collez ici la lettre de motivation générée (Markdown)…"
                  rows={10}
                  className="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {/* Copy letter */}
              <button
                onClick={handleCopyCoverLetter}
                disabled={!mdInput.trim()}
                className="w-full py-2.5 flex items-center justify-center gap-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white transition-colors shadow-sm"
              >
                <Copy className="w-4 h-4" />
                Copier la lettre
              </button>
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
