import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { BULLET_FOCUS_OPTIONS, normalizeBulletFocus } from '@/lib/cv-focus-rules';
import {
  DEFAULT_TARGET_SHEETS, TARGET_TYPES, TARGET_TYPE_LABELS, equivalenceLines, parseEquivalenceLines, resetSheet,
  setSheetOverride, sheetFor, splitLines,
  type SheetOverrides, type TargetSheet, type TargetTitleRule, type TargetType,
} from '@/lib/cv-targets';

interface TargetSheetsEditorProps {
  overrides: SheetOverrides;
  onChange: (next: SheetOverrides) => void;
}

const fieldCls = 'w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 placeholder:italic focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400';
const labelCls = 'block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1';

const TITLE_RULE_LABELS: Record<TargetTitleRule, string> = {
  profile: 'Titre du profil tel quel',
  'profile+keyword': 'Titre du profil, éventuellement suivi d\'un mot-clé',
  equivalence: 'Titre traduit via les équivalences',
  free: 'Titre libre',
};
const PHOTO_LABELS = { oui: 'Photo conseillée', non: 'Photo déconseillée', indifferent: 'Photo indifférente' } as const;

const canonEquivalences = (text: string): string => equivalenceLines(parseEquivalenceLines(text));
const canonLines = (text: string): string => splitLines(text).join('\n');

/**
 * Un texte multi-lignes : vide = valeur par défaut (affichée en grisé dans le champ). Le texte saisi
 * est gardé tel quel pendant la frappe (les retours à la ligne ne sont pas avalés) ; il n'est resynchronisé
 * que si la valeur enregistrée change autrement, par exemple « Revenir aux valeurs par défaut ».
 */
function ListField({ label, value, placeholder, rows = 3, canon = canonLines, onCommit }: {
  label: string; value: string; placeholder: string; rows?: number; canon?: (text: string) => string; onCommit: (text: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(current => (canon(current) === value ? current : value));
  }, [value, canon]);
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <textarea
        rows={rows} className={fieldCls} value={text} placeholder={placeholder}
        onChange={e => { setText(e.target.value); onCommit(e.target.value); }}
      />
    </div>
  );
}

/** Liste déroulante dont la première option « Par défaut (…) » est grisée tant que rien n'est modifié. */
function DefaultableSelect({ label, value, defaultLabel, options, onCommit }: {
  label: string; value: string; defaultLabel: string; options: readonly { value: string; label: string }[]; onCommit: (v: string) => void;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select
        className={`${fieldCls} ${value === '' ? 'text-gray-400 italic' : ''}`}
        value={value}
        onChange={e => onCommit(e.target.value)}
      >
        <option value="">{`Par défaut (${defaultLabel})`}</option>
        {options.map(o => <option key={o.value} value={o.value} className="text-gray-900">{o.label}</option>)}
      </select>
    </div>
  );
}

/**
 * Fiches de ciblage par type de structure. Les valeurs par défaut sont affichées en grisé ;
 * seuls les champs modifiés sont stockés (une valeur identique au défaut, ou un champ vidé, revient au défaut).
 */
export function TargetSheetsEditor({ overrides, onChange }: TargetSheetsEditorProps) {
  const [type, setType] = useState<TargetType>('esn');
  const base = DEFAULT_TARGET_SHEETS[type];
  const own = overrides[type] as Partial<TargetSheet> | undefined;
  const effective = sheetFor(type, overrides);
  const customized = own !== undefined;

  /** Applique un changement de champ : la fiche effective modifiée est réduite à ses différences avec le défaut. */
  const commit = (patch: Partial<TargetSheet>) => onChange(setSheetOverride(overrides, type, { ...effective, ...patch }));
  const commitVocab = (patch: Partial<TargetSheet['vocabulaire']>) => commit({ vocabulaire: { ...effective.vocabulaire, ...patch } });
  const commitDisplay = (patch: Partial<TargetSheet['affichage']>) => commit({ affichage: { ...effective.affichage, ...patch } });

  const listCommit = (key: 'attentes' | 'valorise' | 'eviter' | 'avoidTerms') => (text: string) => {
    const lines = splitLines(text);
    commit({ [key]: text.trim() === '' ? base[key] : lines } as Partial<TargetSheet>);
  };
  const shown = (key: 'attentes' | 'valorise' | 'eviter' | 'avoidTerms') => (own?.[key] ? (own[key] as string[]).join('\n') : '');
  const focusLabel = BULLET_FOCUS_OPTIONS.find(o => o.value === base.focusParDefaut)?.label ?? base.focusParDefaut;

  return (
    <div className="space-y-4" data-testid="target-sheets-editor">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem]">
          <label className={labelCls} htmlFor="sheet-type">Type de structure</label>
          <select id="sheet-type" className={fieldCls} value={type} onChange={e => setType(e.target.value as TargetType)}>
            {TARGET_TYPES.map(t => (
              <option key={t} value={t}>{TARGET_TYPE_LABELS[t]}{overrides[t] ? ' (personnalisée)' : ''}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!customized}
          onClick={() => onChange(resetSheet(overrides, type))}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
        >
          <RotateCcw size={14} /> Revenir aux valeurs par défaut
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400 basis-full">
          {base.label}. Les valeurs par défaut sont affichées en grisé ; seul ce que vous modifiez est enregistré. Un champ vidé revient au défaut.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ListField label="Ce que ce lecteur cherche à vérifier (un par ligne)" rows={5} value={shown('attentes')} placeholder={base.attentes.join('\n')} onCommit={listCommit('attentes')} />
        <ListField label="À mettre en avant (un par ligne)" rows={5} value={shown('valorise')} placeholder={base.valorise.join('\n')} onCommit={listCommit('valorise')} />
        <ListField label="À éviter (consignes, une par ligne)" value={shown('eviter')} placeholder={base.eviter.join('\n')} onCommit={listCommit('eviter')} />
        <ListField label="Termes interdits (mots détectés par le garde-fou, un par ligne)" value={shown('avoidTerms')} placeholder={base.avoidTerms.length ? base.avoidTerms.join('\n') : '(aucun)'} onCommit={listCommit('avoidTerms')} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Registre</label>
          <input className={fieldCls} value={own?.vocabulaire?.registre ?? ''} placeholder={base.vocabulaire.registre}
            onChange={e => commitVocab({ registre: e.target.value.trim() === '' ? base.vocabulaire.registre : e.target.value })} />
        </div>
        <ListField label="Termes à privilégier (un par ligne)" rows={2} value={own?.vocabulaire?.privilegier?.join('\n') ?? ''} placeholder={base.vocabulaire.privilegier.join('\n')}
          onCommit={text => commitVocab({ privilegier: text.trim() === '' ? base.vocabulaire.privilegier : splitLines(text) })} />
        <div className="md:col-span-2">
          <ListField canon={canonEquivalences} label="Équivalences autorisées (« terme → équivalent », une par ligne)" rows={4}
            value={own?.vocabulaire?.equivalences ? equivalenceLines(own.vocabulaire.equivalences) : ''}
            placeholder={base.vocabulaire.equivalences.length ? equivalenceLines(base.vocabulaire.equivalences) : '(aucune)'}
            onCommit={text => commitVocab({ equivalences: text.trim() === '' ? base.vocabulaire.equivalences : parseEquivalenceLines(text) })} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <DefaultableSelect
          label="Orientation par défaut" value={own?.focusParDefaut ?? ''} defaultLabel={focusLabel}
          options={BULLET_FOCUS_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          onCommit={v => commit({ focusParDefaut: normalizeBulletFocus(v) ?? base.focusParDefaut })}
        />
        <DefaultableSelect
          label="Règle de titre" value={own?.titreParDefaut ?? ''} defaultLabel={TITLE_RULE_LABELS[base.titreParDefaut]}
          options={(Object.keys(TITLE_RULE_LABELS) as TargetTitleRule[]).map(v => ({ value: v, label: TITLE_RULE_LABELS[v] }))}
          onCommit={v => commit({ titreParDefaut: (v || base.titreParDefaut) as TargetTitleRule })}
        />
        <DefaultableSelect
          label="Mots-clés ATS" value={own?.ats === undefined ? '' : own.ats ? 'oui' : 'non'} defaultLabel={base.ats ? 'oui' : 'non'}
          options={[{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }]}
          onCommit={v => commit({ ats: v === '' ? base.ats : v === 'oui' })}
        />
        <DefaultableSelect
          label="Photo" value={own?.affichage?.photo ?? ''} defaultLabel={PHOTO_LABELS[base.affichage.photo]}
          options={(Object.keys(PHOTO_LABELS) as (keyof typeof PHOTO_LABELS)[]).map(v => ({ value: v, label: PHOTO_LABELS[v] }))}
          onCommit={v => commitDisplay({ photo: (v || base.affichage.photo) as TargetSheet['affichage']['photo'] })}
        />
        <div>
          <label className={labelCls}>Longueur conseillée</label>
          <input className={fieldCls} value={own?.affichage?.longueur ?? ''} placeholder={base.affichage.longueur}
            onChange={e => commitDisplay({ longueur: e.target.value.trim() === '' ? base.affichage.longueur : e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Sections</label>
          <input className={fieldCls} value={own?.affichage?.sections ?? ''} placeholder={base.affichage.sections}
            onChange={e => commitDisplay({ sections: e.target.value.trim() === '' ? base.affichage.sections : e.target.value })} />
        </div>
      </div>
    </div>
  );
}
