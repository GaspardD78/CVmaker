import { VERB_TENSE_OPTIONS, normalizeVerbTense, type VerbTense } from '@/lib/cv-focus-rules';

interface VerbTenseSelectProps {
  value: VerbTense;
  onChange: (value: VerbTense) => void;
  id?: string;
}

/** Forme du premier mot des puces : infinitif / passé-présent / nominal (réglage par profil). */
export function VerbTenseSelect({ value, onChange, id }: VerbTenseSelectProps) {
  const help = VERB_TENSE_OPTIONS.find(o => o.value === value)?.help;
  return (
    <div>
      <select
        id={id}
        value={value}
        onChange={e => onChange(normalizeVerbTense(e.target.value) ?? value)}
        className="w-full p-1.5 border rounded text-sm focus:ring focus:ring-blue-200 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
        aria-label="Début des puces"
      >
        {VERB_TENSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {help && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{help}</p>}
    </div>
  );
}
