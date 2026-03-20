import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { Upload, FileText, FileCode2, Braces, ArrowLeft, ArrowRight, Check, Copy, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProfileStore } from '@/stores/profileStore';
import type { Profile, MasterEntry } from '@/types/profile';

import type { ImportFormat, ImportPayload, ProfileFieldDiff, SelectableEntry } from '@/lib/import/types';
import { parseLinkedInZip } from '@/lib/import/linkedin-parser';
import { extractTextFromPdf } from '@/lib/import/pdf-extractor';
import { extractTextFromDocx } from '@/lib/import/docx-extractor';
import { buildImportPrompt } from '@/lib/import/import-prompt';
import { parseImportJson } from '@/lib/import/json-validator';

// ─────────────────────────────────────────────────────────────────────────────
// Step indicators
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'source', label: 'Source' },
  { id: 'process', label: 'Préparer' },
  { id: 'preview', label: 'Prévisualiser' },
  { id: 'done', label: 'Terminé' },
] as const;

type StepId = typeof STEPS[number]['id'];

function StepBar({ current }: { current: StepId }) {
  const idx = STEPS.findIndex(s => s.id === current);
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                  done
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : active
                    ? 'bg-white dark:bg-gray-900 border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-400'
                }`}
              >
                {done ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={`mt-1 text-xs font-medium whitespace-nowrap ${
                  active ? 'text-blue-600 dark:text-blue-400' : done ? 'text-blue-500' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 mb-4 transition-colors ${done ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Source selection
// ─────────────────────────────────────────────────────────────────────────────

const FORMAT_OPTIONS: { id: ImportFormat; label: string; desc: string; icon: React.ElementType; accept: string }[] = [
  {
    id: 'linkedin',
    label: 'LinkedIn ZIP',
    desc: 'Export complet LinkedIn (Paramètres → Confidentialité → Obtenir une copie de vos données)',
    icon: Upload,
    accept: '.zip',
  },
  {
    id: 'pdf',
    label: 'CV en PDF',
    desc: 'Extraction du texte puis génération d\'un prompt LLM pour structurer les données',
    icon: FileText,
    accept: '.pdf',
  },
  {
    id: 'docx',
    label: 'CV en DOCX',
    desc: 'Extraction du texte puis génération d\'un prompt LLM pour structurer les données',
    icon: FileCode2,
    accept: '.docx,.doc',
  },
  {
    id: 'json',
    label: 'JSON structuré',
    desc: 'Collez directement un JSON produit par un LLM à partir du schéma ResumeForge',
    icon: Braces,
    accept: '',
  },
];

function StepSource({ onNext }: { onNext: (format: ImportFormat, payload: ImportPayload | null, rawText?: string) => void }) {
  const [selected, setSelected] = useState<ImportFormat | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = async () => {
    if (!selected) return;
    setError(null);

    if (selected === 'json') {
      onNext('json', null);
      return;
    }

    const opt = FORMAT_OPTIONS.find(f => f.id === selected)!;
    const filePath = await open({
      filters: [{ name: opt.label, extensions: opt.accept.replace(/\./g, '').split(',') }],
      multiple: false,
    });
    if (!filePath || typeof filePath !== 'string') return;

    setLoading(true);
    try {
      const bytes = await readFile(filePath);
      const ab = bytes.buffer as ArrayBuffer;

      if (selected === 'linkedin') {
        const payload = await parseLinkedInZip(ab);
        if (!payload.entries?.length && !payload.profile) {
          throw new Error('Aucune donnée trouvée dans le ZIP. Vérifie que le fichier est bien un export LinkedIn complet.');
        }
        onNext('linkedin', payload);
      } else if (selected === 'pdf') {
        const text = await extractTextFromPdf(ab);
        if (!text.trim()) throw new Error('Impossible d\'extraire le texte de ce PDF (PDF scanné sans OCR ?).');
        onNext('pdf', null, text);
      } else if (selected === 'docx') {
        const text = await extractTextFromDocx(ab);
        if (!text.trim()) throw new Error('Impossible d\'extraire le texte de ce fichier DOCX.');
        onNext('docx', null, text);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Choisir la source d'import</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Sélectionnez le format du fichier que vous souhaitez importer.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FORMAT_OPTIONS.map(opt => {
          const Icon = opt.icon;
          const active = selected === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                active
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 bg-white dark:bg-gray-800'
              }`}
            >
              <div className="flex items-center gap-3 mb-1">
                <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-blue-600' : 'text-gray-500 dark:text-gray-400'}`} />
                <span className={`font-semibold text-sm ${active ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-100'}`}>
                  {opt.label}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed pl-8">{opt.desc}</p>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={handlePick} disabled={!selected || loading}>
          {loading ? 'Traitement...' : selected === 'json' ? 'Continuer' : 'Ouvrir un fichier'}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Process (prompt-based for PDF/DOCX, JSON paste)
// ─────────────────────────────────────────────────────────────────────────────

function StepProcess({
  format,
  rawText,
  onNext,
  onBack,
}: {
  format: ImportFormat;
  rawText?: string;
  onNext: (payload: ImportPayload) => void;
  onBack: () => void;
}) {
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRawText, setShowRawText] = useState(false);

  const prompt = rawText ? buildImportPrompt(rawText) : '';

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = () => {
    setError(null);
    try {
      const payload = parseImportJson(jsonInput);
      onNext(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const isPromptBased = format === 'pdf' || format === 'docx';
  const formatLabel = format === 'pdf' ? 'PDF' : format === 'docx' ? 'DOCX' : 'JSON';

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
        {isPromptBased ? `Analyser votre ${formatLabel} avec un LLM` : 'Coller le JSON structuré'}
      </h2>

      {isPromptBased ? (
        <div className="space-y-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Le texte de votre {formatLabel} a été extrait. Copiez le prompt ci-dessous, collez-le dans ChatGPT, Claude ou tout autre LLM, puis collez la réponse JSON dans le champ en bas.
          </p>

          {/* Prompt block */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Prompt à copier</span>
              <Button variant="ghost" size="sm" onClick={copyPrompt} className="h-7 px-2 text-xs gap-1.5">
                <Copy className="w-3.5 h-3.5" />
                {copied ? 'Copié !' : 'Copier'}
              </Button>
            </div>
            <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-40 leading-relaxed whitespace-pre-wrap font-mono">
              {prompt}
            </pre>
          </div>

          {/* Raw text toggle */}
          {rawText && (
            <button
              onClick={() => setShowRawText(v => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              {showRawText ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showRawText ? 'Masquer le texte extrait' : 'Voir le texte extrait du fichier'}
            </button>
          )}
          {showRawText && rawText && (
            <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap font-mono border border-gray-200 dark:border-gray-700">
              {rawText}
            </pre>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Réponse du LLM (JSON)
            </label>
            <textarea
              value={jsonInput}
              onChange={e => setJsonInput(e.target.value)}
              placeholder='{ "profile": { ... }, "entries": [ ... ] }'
              rows={8}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-mono text-gray-800 dark:text-gray-200 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Collez ici un JSON au format ResumeForge (produit par un LLM ou généré manuellement).
          </p>
          <div>
            <details className="group">
              <summary className="cursor-pointer text-xs text-blue-600 dark:text-blue-400 hover:underline select-none">
                Voir le schéma JSON attendu
              </summary>
              <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 overflow-auto max-h-56 font-mono border border-gray-200 dark:border-gray-700">
{`{
  "profile": {
    "firstName": "Marie",
    "lastName": "Dupont",
    "email": "marie@example.com",
    "phone": "+33 6 12 34 56 78",
    "city": "Paris",
    "country": "France",
    "title": "Recruteuse spécialisée cybersécurité",
    "summary": "10 ans d'expérience en recrutement IT..."
  },
  "entries": [
    {
      "entryType": "experience",
      "title": "Recruteuse Senior",
      "subtitle": "CyberTalent SAS",
      "location": "Paris",
      "startDate": "2020-03",
      "isCurrent": true,
      "description": "- Sourcing de profils IAM, GRC, SOC\\n- Gestion de 50 postes/an"
    },
    {
      "entryType": "skill",
      "title": "Boolean Search",
      "subtitle": "Expert"
    },
    {
      "entryType": "language",
      "title": "Anglais",
      "subtitle": "Courant (C1)"
    }
  ]
}`}
              </pre>
            </details>
          </div>
          <textarea
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
            placeholder='{ "profile": { ... }, "entries": [ ... ] }'
            rows={12}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-mono text-gray-800 dark:text-gray-200 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <Button onClick={handleSubmit} disabled={!jsonInput.trim()}>
          Prévisualiser
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Preview & merge
// ─────────────────────────────────────────────────────────────────────────────

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

function buildProfileDiffs(existing: Profile | null, imported: Partial<Record<string, string>>): ProfileFieldDiff[] {
  return Object.entries(PROFILE_FIELD_LABELS).map(([key, label]) => {
    const existingVal = existing ? (existing as unknown as Record<string, string | null>)[
      key === 'firstName' ? 'firstName'
      : key === 'lastName' ? 'lastName'
      : key === 'linkedinUrl' ? 'linkedinUrl'
      : key === 'githubUrl' ? 'githubUrl'
      : key === 'portfolioUrl' ? 'portfolioUrl'
      : key === 'postalCode' ? 'postalCode'
      : key
    ] ?? null : null;
    const importedVal = imported[key] ?? null;
    return {
      key: key as ProfileFieldDiff['key'],
      label,
      existing: existingVal,
      imported: importedVal,
      useImported: !existingVal && !!importedVal, // auto: fill empty fields
    };
  }).filter(d => d.imported !== null); // only show fields that have imported data
}

function buildSelectableEntries(imported: SelectableEntry['data'][], existing: MasterEntry[]): SelectableEntry[] {
  return imported.map(entry => {
    const possibleDuplicate = existing.some(
      e =>
        e.entryType === entry.entryType &&
        e.title.toLowerCase().trim() === entry.title.toLowerCase().trim(),
    );
    return { data: entry, selected: !possibleDuplicate, possibleDuplicate };
  });
}

function StepPreview({
  payload,
  onConfirm,
  onBack,
}: {
  payload: ImportPayload;
  onConfirm: (diffs: ProfileFieldDiff[], entries: SelectableEntry[]) => void;
  onBack: () => void;
}) {
  const { profile: existingProfile, entries: existingEntries } = useProfileStore();

  const [profileDiffs, setProfileDiffs] = useState<ProfileFieldDiff[]>(() =>
    buildProfileDiffs(existingProfile, (payload.profile ?? {}) as Partial<Record<string, string>>),
  );

  const [selectableEntries, setSelectableEntries] = useState<SelectableEntry[]>(() =>
    buildSelectableEntries(payload.entries ?? [], existingEntries),
  );

  const toggleProfileField = (key: string) => {
    setProfileDiffs(prev =>
      prev.map(d => (d.key === key ? { ...d, useImported: !d.useImported } : d)),
    );
  };

  const toggleEntry = (idx: number) => {
    setSelectableEntries(prev =>
      prev.map((e, i) => (i === idx ? { ...e, selected: !e.selected } : e)),
    );
  };

  const toggleAllEntries = (type: string, selected: boolean) => {
    setSelectableEntries(prev =>
      prev.map(e => (e.data.entryType === type ? { ...e, selected } : e)),
    );
  };

  const selectedCount = selectableEntries.filter(e => e.selected).length;
  const profileChanges = profileDiffs.filter(d => d.useImported).length;

  // Group entries by type
  const entriesByType = selectableEntries.reduce<Record<string, { entry: SelectableEntry; idx: number }[]>>(
    (acc, entry, idx) => {
      const t = entry.data.entryType;
      if (!acc[t]) acc[t] = [];
      acc[t].push({ entry, idx });
      return acc;
    },
    {},
  );

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Prévisualiser et choisir ce à importer</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        {profileChanges > 0 && `${profileChanges} champ(s) de profil · `}
        {selectedCount} entrée(s) sélectionnée(s) sur {selectableEntries.length}
      </p>

      {/* Profile diffs */}
      {profileDiffs.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
            Informations personnelles
          </h3>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
            {profileDiffs.map(diff => (
              <div key={diff.key} className="flex items-start gap-3 px-4 py-3 bg-white dark:bg-gray-800">
                <input
                  type="checkbox"
                  id={`diff-${diff.key}`}
                  checked={diff.useImported}
                  onChange={() => toggleProfileField(diff.key)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 flex-shrink-0"
                />
                <label htmlFor={`diff-${diff.key}`} className="flex-1 cursor-pointer min-w-0">
                  <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">{diff.label}</span>
                  <div className="flex flex-col gap-1">
                    {diff.existing && (
                      <span className="text-xs text-gray-400 line-through truncate">{diff.existing}</span>
                    )}
                    <span className={`text-sm truncate ${diff.useImported ? 'text-green-700 dark:text-green-400 font-medium' : 'text-gray-600 dark:text-gray-300'}`}>
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
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                {ENTRY_TYPE_LABELS[type] ?? type} ({items.length})
              </h3>
              <div className="flex gap-2">
                {!allSelected && (
                  <button onClick={() => toggleAllEntries(type, true)} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                    Tout sélectionner
                  </button>
                )}
                {!noneSelected && (
                  <button onClick={() => toggleAllEntries(type, false)} className="text-xs text-gray-500 hover:underline dark:text-gray-400">
                    Tout désélectionner
                  </button>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
              {items.map(({ entry, idx }) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                    entry.selected ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50 opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    id={`entry-${idx}`}
                    checked={entry.selected}
                    onChange={() => toggleEntry(idx)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 flex-shrink-0"
                  />
                  <label htmlFor={`entry-${idx}`} className="flex-1 cursor-pointer min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{entry.data.title}</span>
                      {entry.data.subtitle && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{entry.data.subtitle}</span>
                      )}
                      {entry.possibleDuplicate && (
                        <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0">
                          <AlertTriangle className="w-3 h-3" />
                          Doublon possible
                        </span>
                      )}
                    </div>
                    {(entry.data.startDate || entry.data.location) && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {[entry.data.startDate, entry.data.endDate ? `→ ${entry.data.endDate}` : entry.data.isCurrent ? '→ Aujourd\'hui' : '', entry.data.location].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {entry.data.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{entry.data.description}</p>
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
          <p className="text-sm">Aucune donnée à importer.</p>
        </div>
      )}

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <Button
          onClick={() => onConfirm(profileDiffs, selectableEntries)}
          disabled={profileChanges === 0 && selectedCount === 0}
        >
          Importer ({profileChanges + selectedCount} élément{profileChanges + selectedCount > 1 ? 's' : ''})
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Done
// ─────────────────────────────────────────────────────────────────────────────

function StepDone({ profileCount, entryCount, onGoToProfile }: { profileCount: number; entryCount: number; onGoToProfile: () => void }) {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
        <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
      </div>
      <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">Import terminé !</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {profileCount > 0 && `${profileCount} champ(s) de profil mis à jour · `}
        {entryCount} entrée(s) ajoutée(s) à votre profil.
      </p>
      <Button onClick={onGoToProfile}>
        Voir mon profil
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ImportPage
// ─────────────────────────────────────────────────────────────────────────────

export function ImportPage() {
  const navigate = useNavigate();
  const { profile: currentProfile, updateProfile, addEntry, fetchProfile } = useProfileStore();

  const [step, setStep] = useState<StepId>('source');
  const [format, setFormat] = useState<ImportFormat | null>(null);
  const [rawText, setRawText] = useState<string | undefined>();
  const [payload, setPayload] = useState<ImportPayload | null>(null);
  const [importResult, setImportResult] = useState({ profileCount: 0, entryCount: 0 });
  const [importing, setImporting] = useState(false);

  // Source → next step
  const handleSourceNext = (fmt: ImportFormat, parsedPayload: ImportPayload | null, text?: string) => {
    setFormat(fmt);
    setRawText(text);

    if (parsedPayload) {
      // LinkedIn: skip process step, go straight to preview
      setPayload(parsedPayload);
      setStep('preview');
    } else {
      // PDF/DOCX/JSON: go to process step
      setStep('process');
    }
  };

  // Process → preview
  const handleProcessNext = (parsedPayload: ImportPayload) => {
    setPayload(parsedPayload);
    setStep('preview');
  };

  // Preview → done (apply import)
  const handleConfirm = async (diffs: ProfileFieldDiff[], entries: SelectableEntry[]) => {
    setImporting(true);
    try {
      // Update profile fields
      const profileUpdates: Partial<Profile> = {};
      for (const diff of diffs) {
        if (diff.useImported && diff.imported) {
          (profileUpdates as Record<string, string>)[diff.key] = diff.imported;
        }
      }
      if (Object.keys(profileUpdates).length > 0) {
        await updateProfile(profileUpdates);
      }

      // Fetch the (potentially just-created) profile to get the real ID
      const profileId = useProfileStore.getState().profile?.id ?? currentProfile?.id ?? '';

      // Add selected entries
      const selectedEntries = entries.filter(e => e.selected);
      for (const { data } of selectedEntries) {
        await addEntry({
          profileId,
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
      }

      await fetchProfile();

      setImportResult({
        profileCount: Object.keys(profileUpdates).length,
        entryCount: selectedEntries.length,
      });
      setStep('done');
      toast.success(`Import réussi — ${selectedEntries.length} entrée(s) ajoutée(s)`);
    } catch (e) {
      toast.error(`Erreur lors de l'import : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour au profil
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Importer un profil</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Importez vos données depuis un CV existant ou un export LinkedIn.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <StepBar current={step} />

        {step === 'source' && <StepSource onNext={handleSourceNext} />}

        {step === 'process' && format && (
          <StepProcess
            format={format}
            rawText={rawText}
            onNext={handleProcessNext}
            onBack={() => setStep('source')}
          />
        )}

        {step === 'preview' && payload && (
          importing ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <p className="text-sm">Import en cours...</p>
            </div>
          ) : (
            <StepPreview
              payload={payload}
              onConfirm={handleConfirm}
              onBack={() => setStep(format === 'linkedin' ? 'source' : 'process')}
            />
          )
        )}

        {step === 'done' && (
          <StepDone
            profileCount={importResult.profileCount}
            entryCount={importResult.entryCount}
            onGoToProfile={() => navigate('/profile')}
          />
        )}
      </div>
    </div>
  );
}
