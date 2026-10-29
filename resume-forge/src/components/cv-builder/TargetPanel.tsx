import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  FIRST_READERS, FIRST_READER_LABELS, INTENTS, INTENT_LABELS, TARGET_TYPES, TARGET_TYPE_LABELS, splitLines,
  type DetectedTarget, type FirstReader, type Intent, type TargetBrief, type TargetChoice, type TargetType,
} from '@/lib/cv-targets';

interface TargetPanelProps {
  choice: TargetChoice;
  onChange: (choice: TargetChoice) => void;
  /** Axes détectés par l'application (affichés dans l'option « Auto »). */
  detected: DetectedTarget;
  /** Type et intention effectifs (choix, sinon détection) : pilotent les champs affichés. */
  effectiveType: TargetType | null;
  effectiveIntent: Intent;
  /** Change à chaque demande « Modifier et régénérer » : ouvre « Préciser la cible ». */
  expandSignal?: number;
}

const inputCls = 'w-full p-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md text-xs focus:ring-2 focus:ring-amber-200 focus:border-amber-400';
const labelCls = 'block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-0.5';

const TIPS = {
  type: 'Le type de structure adapte le vocabulaire, les priorités et l\'orientation par défaut.',
  intent: 'La démarche : réponse à une annonce, candidature spontanée, recommandation, mobilité interne ou approche d\'un chasseur.',
  reader: 'Qui lira le CV en premier : l\'accroche est rédigée pour lui.',
} as const;

function AxisSelect<T extends string>({ id, label, tip, values, labels, value, detected, onChange }: {
  id: string; label: string; tip: string; values: readonly T[]; labels: Readonly<Record<T, string>>;
  value: T | 'auto' | undefined; detected?: T; onChange: (v: T | 'auto') => void;
}) {
  return (
    <div title={tip}>
      <label htmlFor={id} className={labelCls}>{label}</label>
      <select
        id={id}
        value={value ?? 'auto'}
        onChange={e => onChange(e.target.value as T | 'auto')}
        className={inputCls}
      >
        <option value="auto">{detected ? `Auto (${labels[detected]})` : 'Auto'}</option>
        {values.map(v => <option key={v} value={v}>{labels[v]}</option>)}
      </select>
    </div>
  );
}

/**
 * Ciblage du CV : type de structure, intention, premier lecteur (tous en « Auto » par défaut) sur une
 * ligne ; formulaire de cible et champs du lecteur repliés sous « Préciser la cible ».
 */
export function TargetPanel({ choice, onChange, detected, effectiveType, effectiveIntent, expandSignal }: TargetPanelProps) {
  const needsBrief = effectiveIntent !== 'annonce';
  const [open, setOpen] = useState(effectiveIntent === 'spontanee' || effectiveIntent === 'recommandation');
  const [positionsText, setPositionsText] = useState((choice.brief?.positions ?? []).join('\n'));
  const [strengthsText, setStrengthsText] = useState((choice.brief?.strengths ?? []).join('\n'));

  useEffect(() => { if (expandSignal) setOpen(true); }, [expandSignal]);
  // Une démarche sans annonce ouvre le formulaire de cible : c'est lui qui remplace l'annonce.
  useEffect(() => {
    if (effectiveIntent === 'spontanee' || effectiveIntent === 'recommandation') setOpen(true);
  }, [effectiveIntent]);

  const set = (patch: Partial<TargetChoice>) => onChange({ ...choice, ...patch });
  const setBrief = (patch: Partial<TargetBrief>) => set({ brief: { ...choice.brief, ...patch } });

  return (
    <div className="space-y-2" data-testid="target-panel">
      <div className="grid grid-cols-3 gap-2">
        <AxisSelect
          id="target-type" label="Type de structure" tip={TIPS.type} values={TARGET_TYPES} labels={TARGET_TYPE_LABELS}
          value={choice.type} detected={detected.type} onChange={v => set({ type: v })}
        />
        <AxisSelect
          id="target-intent" label="Intention" tip={TIPS.intent} values={INTENTS} labels={INTENT_LABELS}
          value={choice.intent} detected={detected.intent} onChange={v => set({ intent: v })}
        />
        <AxisSelect
          id="target-reader" label="Premier lecteur" tip={TIPS.reader} values={FIRST_READERS} labels={FIRST_READER_LABELS}
          value={choice.firstReader} onChange={(v: FirstReader | 'auto') => set({ firstReader: v })}
        />
      </div>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Préciser la cible
      </button>

      {open && (
        <div className="space-y-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-3">
          {needsBrief && (
            <fieldset className="space-y-2">
              <legend className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Cible</legend>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="brief-company" className={labelCls}>Entreprise</label>
                  <input id="brief-company" className={inputCls} value={choice.brief?.company ?? ''} onChange={e => setBrief({ company: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="brief-activity" className={labelCls}>Activité</label>
                  <input id="brief-activity" className={inputCls} value={choice.brief?.activity ?? ''} onChange={e => setBrief({ activity: e.target.value })} />
                </div>
              </div>
              <div>
                <label htmlFor="brief-hr" className={labelCls}>Contexte RH connu</label>
                <input id="brief-hr" className={inputCls} value={choice.brief?.hrContext ?? ''} onChange={e => setBrief({ hrContext: e.target.value })} />
              </div>
              <div>
                <label htmlFor="brief-positions" className={labelCls}>Postes envisagés, par ordre de priorité (un par ligne)</label>
                <textarea
                  id="brief-positions" rows={3} className={`${inputCls} resize-y`} value={positionsText}
                  onChange={e => { setPositionsText(e.target.value); setBrief({ positions: splitLines(e.target.value) }); }}
                />
              </div>
              <div>
                <label htmlFor="brief-strengths" className={labelCls}>Atouts à mettre en avant (un par ligne)</label>
                <textarea
                  id="brief-strengths" rows={3} className={`${inputCls} resize-y`} value={strengthsText}
                  onChange={e => { setStrengthsText(e.target.value); setBrief({ strengths: splitLines(e.target.value) }); }}
                />
              </div>
              <div>
                <label htmlFor="brief-context" className={labelCls}>Autre contexte connu</label>
                <textarea id="brief-context" rows={2} className={`${inputCls} resize-y`} value={choice.brief?.context ?? ''} onChange={e => setBrief({ context: e.target.value })} />
              </div>
            </fieldset>
          )}

          <fieldset className="space-y-2">
            <legend className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Premier lecteur</legend>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="reader-name" className={labelCls}>Premier lecteur : nom</label>
                <input id="reader-name" className={inputCls} value={choice.readerName ?? ''} onChange={e => set({ readerName: e.target.value })} autoComplete="off" />
              </div>
              <div>
                <label htmlFor="reader-role" className={labelCls}>Premier lecteur : fonction</label>
                <input id="reader-role" className={inputCls} value={choice.readerRole ?? ''} onChange={e => set({ readerRole: e.target.value })} />
              </div>
            </div>
            {effectiveIntent === 'recommandation' && (
              <div>
                <label htmlFor="referrer-name" className={labelCls}>Transmis par : nom</label>
                <input id="referrer-name" className={inputCls} value={choice.referrerName ?? ''} onChange={e => set({ referrerName: e.target.value })} autoComplete="off" />
              </div>
            )}
            <div>
              <label htmlFor="reader-note" className={labelCls}>Ce que valorise ce lecteur</label>
              <textarea
                id="reader-note" rows={2} className={`${inputCls} resize-y`} value={choice.readerNote ?? ''}
                placeholder="Ex : dimensionnement, délais, engagements tenus"
                onChange={e => set({ readerNote: e.target.value })}
              />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Les noms restent sur cet appareil : ni dans le prompt, ni dans l'export, ni dans la sauvegarde Google Drive. Le prompt reçoit la fonction et la note.
            </p>
          </fieldset>

          {effectiveType === 'public' && (
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Fonction publique (repris du texte, jamais déduit)</legend>
              <div>
                <label htmlFor="public-categorie" className={labelCls}>Catégorie visée</label>
                <select
                  id="public-categorie" className={inputCls} value={choice.publicDetails?.categorie ?? ''}
                  onChange={e => set({ publicDetails: { ...choice.publicDetails, categorie: (e.target.value || undefined) as 'A' | 'B' | 'C' | undefined } })}
                >
                  <option value="">Non précisée</option>
                  {(['A', 'B', 'C'] as const).map(c => <option key={c} value={c}>Catégorie {c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="public-filiere" className={labelCls}>Filière</label>
                <input id="public-filiere" className={inputCls} value={choice.publicDetails?.filiere ?? ''} onChange={e => set({ publicDetails: { ...choice.publicDetails, filiere: e.target.value } })} />
              </div>
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}
