import { useState } from 'react';
import { Check, Copy, ArrowLeft, ArrowRight, X, AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useProfileStore } from '@/stores/profileStore';
import { parseImportJson } from '@/lib/import/json-validator';
import { Profile, MasterEntry } from '@/types/profile';
import { ProfileFieldDiff, SelectableEntry } from '@/lib/import/types';
import { generateEnrichPrompt } from '@/lib/prompt-templates';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILE_FIELD_LABELS: Record<string, string> = {
  firstName: 'Prénom',
  lastName: 'Nom',
  email: 'Email',
  phone: 'Téléphone',
  address: 'Adresse',
  city: 'Ville',
  postalCode: 'Code postal',
  country: 'Pays',
  linkedinUrl: 'LinkedIn URL',
  githubUrl: 'GitHub URL',
  portfolioUrl: 'Portfolio URL',
  title: 'Titre professionnel',
  summary: 'Résumé / Accroche',
};

const ENTRY_TYPE_LABELS: Record<string, string> = {
  experience: 'Expériences',
  education: 'Formations',
  skill: 'Compétences',
  certification: 'Certifications',
  language: 'Langues',
  interest: 'Intérêts',
  project: 'Projets',
  volunteer: 'Bénévolat',
};

// ─── Wizard Steps ─────────────────────────────────────────────────────────────

type WizardStep = 'context' | 'prompt' | 'review' | 'done';

const WIZARD_STEPS = [
  { id: 'context', label: 'Contexte' },
  { id: 'prompt', label: 'Prompt' },
  { id: 'review', label: 'Résultat' },
] as const;

function StepBar({ current }: { current: WizardStep }) {
  const stateToIndex: Record<WizardStep, number> = { context: 0, prompt: 1, review: 2, done: 3 };
  const idx = stateToIndex[current];

  return (
    <div className="flex items-center gap-0 mb-6">
      {WIZARD_STEPS.map((step, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                done
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : active
                  ? 'bg-white border-blue-600 text-blue-600'
                  : 'bg-white border-gray-300 text-gray-400'
              }`}>
                {done ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`mt-1 text-xs font-medium whitespace-nowrap ${
                active ? 'text-blue-600' : done ? 'text-blue-500' : 'text-gray-400'
              }`}>
                {step.label}
              </span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 mb-4 transition-colors ${done ? 'bg-blue-600' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Prompt Generation ────────────────────────────────────────────────────────

// generateEnrichPrompt moved to src/lib/prompt-templates.ts





// ─── Diff helpers ─────────────────────────────────────────────────────────────

function buildProfileDiffs(existing: Profile | null, imported: Partial<Record<string, string>>): ProfileFieldDiff[] {
  return Object.entries(PROFILE_FIELD_LABELS).map(([key, label]) => {
    const existingVal = existing ? (existing as unknown as Record<string, string | null>)[key] ?? null : null;
    const importedVal = imported[key] ?? null;
    return {
      key: key as ProfileFieldDiff['key'],
      label,
      existing: existingVal,
      imported: importedVal,
      useImported: !!importedVal, // for enrichment, default to applying the enriched value
    };
  }).filter(d => d.imported !== null);
}

function buildSelectableEntries(imported: SelectableEntry['data'][], existing: MasterEntry[]): SelectableEntry[] {
  return imported.map(entry => {
    const possibleDuplicate = existing.some(
      e => e.entryType === entry.entryType && e.title.toLowerCase().trim() === entry.title.toLowerCase().trim(),
    );
    // For enrichment: select all by default (both updates and new entries)
    return { data: entry, selected: true, possibleDuplicate };
  });
}

// ─── Step 1: Context ──────────────────────────────────────────────────────────

function Step1Context({ onNext }: { onNext: (jobPosting: string) => void }) {
  const [jobPosting, setJobPosting] = useState('');

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Contexte (optionnel)</h2>
      <p className="text-sm text-gray-500 mb-5">
        Si vous avez une offre d'emploi en tête, collez-la ici. Le prompt généré orientera les questions du coach vers ce poste. Laissez vide pour un audit complet du profil (nettoyage, cohérence, consolidation et enrichissement de toutes les sections).
      </p>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Annonce ciblée (optionnel)
        </label>
        <textarea
          value={jobPosting}
          onChange={e => setJobPosting(e.target.value)}
          placeholder="Collez ici le texte de l'offre d'emploi..."
          rows={8}
          className="w-full rounded-lg border border-gray-300 bg-white text-sm text-gray-800 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={() => onNext(jobPosting)}>
          Générer le prompt
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: Prompt ───────────────────────────────────────────────────────────

function Step2Prompt({
  profile,
  entries,
  jobPosting,
  onNext,
  onBack,
}: {
  profile: Profile;
  entries: MasterEntry[];
  jobPosting: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const prompt = generateEnrichPrompt(profile, entries, jobPosting);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Prompt à copier dans un LLM</h2>
      <p className="text-sm text-gray-500 mb-5">
        Copiez ce prompt et collez-le dans Claude, ChatGPT ou tout autre LLM. Répondez aux questions posées une par une, puis collez le JSON final à l'étape suivante.
      </p>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Prompt Coach CV</span>
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2 text-xs gap-1.5">
            <Copy className="w-3.5 h-3.5" />
            {copied ? 'Copié !' : 'Copier'}
          </Button>
        </div>
        <textarea
          readOnly
          value={prompt}
          rows={16}
          className="w-full p-4 text-xs text-gray-700 bg-white font-mono resize-none focus:outline-none leading-relaxed"
        />
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <Button onClick={onNext}>
          J'ai obtenu le JSON
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Review ───────────────────────────────────────────────────────────

function Step3Review({
  onApply,
  onBack,
  existingProfile,
  existingEntries,
}: {
  onApply: (diffs: ProfileFieldDiff[], entries: SelectableEntry[]) => void;
  onBack: () => void;
  existingProfile: Profile | null;
  existingEntries: MasterEntry[];
}) {
  const [phase, setPhase] = useState<'paste' | 'preview'>('paste');
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [profileDiffs, setProfileDiffs] = useState<ProfileFieldDiff[]>([]);
  const [selectableEntries, setSelectableEntries] = useState<SelectableEntry[]>([]);

  const handleValidate = () => {
    setError(null);
    try {
      const payload = parseImportJson(jsonInput);
      const diffs = buildProfileDiffs(existingProfile, (payload.profile ?? {}) as Partial<Record<string, string>>);
      const selectables = buildSelectableEntries(payload.entries ?? [], existingEntries);

      if (diffs.length === 0 && selectables.length === 0) {
        setError('Aucune modification détectée dans le JSON. Assurez-vous que le LLM a bien enrichi votre profil et produit un JSON non vide.');
        return;
      }

      setProfileDiffs(diffs);
      setSelectableEntries(selectables);
      setPhase('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleProfileField = (key: string) => {
    setProfileDiffs(prev => prev.map(d => d.key === key ? { ...d, useImported: !d.useImported } : d));
  };

  const toggleEntry = (idx: number) => {
    setSelectableEntries(prev => prev.map((e, i) => i === idx ? { ...e, selected: !e.selected } : e));
  };

  const toggleAllEntries = (type: string, selected: boolean) => {
    setSelectableEntries(prev => prev.map(e => e.data.entryType === type ? { ...e, selected } : e));
  };

  const selectedCount = selectableEntries.filter(e => e.selected).length;
  const profileChanges = profileDiffs.filter(d => d.useImported).length;

  const entriesByType = selectableEntries.reduce<Record<string, { entry: SelectableEntry; idx: number }[]>>(
    (acc, entry, idx) => {
      const t = entry.data.entryType;
      if (!acc[t]) acc[t] = [];
      acc[t].push({ entry, idx });
      return acc;
    },
    {},
  );

  if (phase === 'paste') {
    return (
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Coller le JSON retourné par le LLM</h2>
        <p className="text-sm text-gray-500 mb-5">
          Une fois la conversation terminée avec le LLM, collez ici le JSON qu'il a produit.
        </p>

        <textarea
          value={jsonInput}
          onChange={e => setJsonInput(e.target.value)}
          placeholder={'{ "profile": { ... }, "entries": [ ... ] }'}
          rows={12}
          className="w-full rounded-lg border border-gray-300 bg-white text-sm font-mono text-gray-800 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />

        {error && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <Button onClick={handleValidate} disabled={!jsonInput.trim()}>
            Prévisualiser les modifications
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  // phase === 'preview'
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Prévisualiser et appliquer</h2>
      <p className="text-sm text-gray-500 mb-5">
        {profileChanges > 0 && `${profileChanges} champ(s) de profil · `}
        {selectedCount} entrée(s) sélectionnée(s) sur {selectableEntries.length}
      </p>

      {/* Profile diffs */}
      {profileDiffs.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Informations personnelles
          </h3>
          <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
            {profileDiffs.map(diff => (
              <div key={diff.key} className="flex items-start gap-3 px-4 py-3 bg-white">
                <input
                  type="checkbox"
                  id={`enrich-diff-${diff.key}`}
                  checked={diff.useImported}
                  onChange={() => toggleProfileField(diff.key)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 flex-shrink-0"
                />
                <label htmlFor={`enrich-diff-${diff.key}`} className="flex-1 cursor-pointer min-w-0">
                  <span className="block text-xs font-medium text-gray-500 mb-0.5">{diff.label}</span>
                  <div className="flex flex-col gap-1">
                    {diff.existing && (
                      <span className="text-xs text-gray-400 line-through truncate">{diff.existing}</span>
                    )}
                    <span className={`text-sm ${diff.useImported ? 'text-green-700 font-medium' : 'text-gray-600'}`}>
                      {diff.imported}
                    </span>
                  </div>
                </label>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Entries by type */}
      {Object.entries(entriesByType).map(([type, items]) => {
        const allSelected = items.every(({ entry }) => entry.selected);
        const noneSelected = items.every(({ entry }) => !entry.selected);
        return (
          <section key={type} className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                {ENTRY_TYPE_LABELS[type] ?? type} ({items.length})
              </h3>
              <div className="flex gap-2">
                {!allSelected && (
                  <button onClick={() => toggleAllEntries(type, true)} className="text-xs text-blue-600 hover:underline">
                    Tout sélectionner
                  </button>
                )}
                {!noneSelected && (
                  <button onClick={() => toggleAllEntries(type, false)} className="text-xs text-gray-500 hover:underline">
                    Tout désélectionner
                  </button>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
              {items.map(({ entry, idx }) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                    entry.selected ? 'bg-white' : 'bg-gray-50 opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    id={`enrich-entry-${idx}`}
                    checked={entry.selected}
                    onChange={() => toggleEntry(idx)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 flex-shrink-0"
                  />
                  <label htmlFor={`enrich-entry-${idx}`} className="flex-1 cursor-pointer min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800 truncate">{entry.data.title}</span>
                      {entry.data.subtitle && (
                        <span className="text-xs text-gray-500 truncate">{entry.data.subtitle}</span>
                      )}
                      {entry.possibleDuplicate && (
                        <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0">
                          <Check className="w-3 h-3" />
                          Mise à jour
                        </span>
                      )}
                    </div>
                    {(entry.data.startDate || entry.data.location) && (
                      <span className="text-xs text-gray-400">
                        {[
                          entry.data.startDate,
                          entry.data.endDate
                            ? `→ ${entry.data.endDate}`
                            : entry.data.isCurrent
                            ? "→ Aujourd'hui"
                            : '',
                          entry.data.location,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                    {entry.data.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{entry.data.description}</p>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {profileDiffs.length === 0 && selectableEntries.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <p className="text-sm">Aucune donnée à appliquer.</p>
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={() => setPhase('paste')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <Button
          onClick={() => onApply(profileDiffs, selectableEntries)}
          disabled={profileChanges === 0 && selectedCount === 0}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          Appliquer ({profileChanges + selectedCount} élément{profileChanges + selectedCount > 1 ? 's' : ''})
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Done ─────────────────────────────────────────────────────────────

function StepDone({ profileCount, entryCount, onClose }: { profileCount: number; entryCount: number; onClose: () => void }) {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <Check className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">Profil enrichi !</h2>
      <p className="text-sm text-gray-500 mb-6">
        {profileCount > 0 && `${profileCount} champ(s) de profil mis à jour · `}
        {entryCount} entrée{entryCount > 1 ? 's' : ''} {entryCount > 1 ? 'traitées' : 'traitée'} (mise à jour ou ajout).
      </p>
      <Button onClick={onClose}>
        Fermer
      </Button>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface AiEnrichModalProps {
  onClose: () => void;
}

export function AiEnrichModal({ onClose }: AiEnrichModalProps) {
  const { profile, entries, updateProfile, addEntry, updateEntry, fetchProfile } = useProfileStore();

  const [step, setStep] = useState<WizardStep>('context');
  const [jobPosting, setJobPosting] = useState('');
  const [enrichResult, setEnrichResult] = useState({ profileCount: 0, entryCount: 0 });
  const [applying, setApplying] = useState(false);

  const handleContextNext = (posting: string) => {
    setJobPosting(posting);
    setStep('prompt');
  };

  const handleApply = async (diffs: ProfileFieldDiff[], selectables: SelectableEntry[]) => {
    if (!profile) return;
    setApplying(true);

    try {
      // Update profile fields
      const profileUpdates: Record<string, string> = {};
      for (const diff of diffs) {
        if (diff.useImported && diff.imported) {
          profileUpdates[diff.key] = diff.imported;
        }
      }
      if (Object.keys(profileUpdates).length > 0) {
        await updateProfile(profileUpdates);
      }

      // Apply entries: update existing ones, add new ones
      const selectedEntries = selectables.filter(e => e.selected);
      let processedCount = 0;

      for (const { data, possibleDuplicate } of selectedEntries) {
        if (possibleDuplicate) {
          const existing = entries.find(
            e => e.entryType === data.entryType && e.title.toLowerCase().trim() === data.title.toLowerCase().trim(),
          );
          if (existing) {
            await updateEntry(existing.id, {
              subtitle: data.subtitle !== undefined ? data.subtitle : existing.subtitle,
              location: data.location !== undefined ? data.location : existing.location,
              startDate: data.startDate !== undefined ? data.startDate : existing.startDate,
              endDate: data.endDate !== undefined ? data.endDate : existing.endDate,
              isCurrent: data.isCurrent !== undefined ? data.isCurrent : existing.isCurrent,
              description: data.description !== undefined ? data.description : existing.description,
            });
            processedCount++;
            continue;
          }
        }

        await addEntry({
          profileId: profile.id,
          entryType: data.entryType,
          title: data.title,
          subtitle: data.subtitle ?? null,
          location: data.location ?? null,
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
          isCurrent: data.isCurrent ?? false,
          description: data.description ?? null,
          metadata: {},
          sortOrder: 0,
          tags: data.tags ?? [],
        });
        processedCount++;
      }

      await fetchProfile();

      setEnrichResult({
        profileCount: Object.keys(profileUpdates).length,
        entryCount: processedCount,
      });
      setStep('done');
      toast.success(`Profil enrichi — ${processedCount} entrée(s) traitée(s)`);
    } catch (e) {
      toast.error(`Erreur lors de l'application : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setApplying(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <h1 className="text-lg font-semibold text-gray-900">Enrichir avec l'IA</h1>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step !== 'done' && <StepBar current={step} />}

          {step === 'context' && (
            <Step1Context onNext={handleContextNext} />
          )}

          {step === 'prompt' && (
            <Step2Prompt
              profile={profile}
              entries={entries}
              jobPosting={jobPosting}
              onNext={() => setStep('review')}
              onBack={() => setStep('context')}
            />
          )}

          {step === 'review' && (
            applying ? (
              <div className="text-center py-10 text-gray-500">
                <p className="text-sm">Application en cours...</p>
              </div>
            ) : (
              <Step3Review
                onApply={handleApply}
                onBack={() => setStep('prompt')}
                existingProfile={profile}
                existingEntries={entries}
              />
            )
          )}

          {step === 'done' && (
            <StepDone
              profileCount={enrichResult.profileCount}
              entryCount={enrichResult.entryCount}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
