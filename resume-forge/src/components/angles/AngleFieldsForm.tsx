import type { CvAngleFields, OlderPolicy, TitleRule } from '@/lib/cv-angles';

/** Champs éditables d'un angle (bibliothèque et proposition du mode 2). */
export type AngleFormValue = Omit<CvAngleFields, 'slug'>;

interface AngleFieldsFormProps {
  value: AngleFormValue;
  onChange: (value: AngleFormValue) => void;
  /** Catégories de compétences existantes (aide à la saisie de l'ordre). */
  categoryHints?: string[];
}

const fieldClass = 'w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md text-sm';
const labelClass = 'block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1';

/** Formulaire des champs d'un angle. Un angle choisit et ordonne : aucun fait de CV ici. */
export function AngleFieldsForm({ value, onChange, categoryHints = [] }: AngleFieldsFormProps) {
  const set = <K extends keyof AngleFormValue>(key: K, v: AngleFormValue[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Nom de l'angle</label>
        <input className={fieldClass} value={value.label} onChange={e => set('label', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Titre du CV</label>
          <select className={fieldClass} value={value.titleRule} onChange={e => set('titleRule', e.target.value as TitleRule)}>
            <option value="profile">Titre du profil tel quel</option>
            <option value="profile+keyword">Titre du profil - mot-clé de l'annonce</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Anciennes expériences</label>
          <select className={fieldClass} value={value.olderPolicy} onChange={e => set('olderPolicy', e.target.value as OlderPolicy)}>
            <option value="one-line">Une ligne, sans description</option>
            <option value="short">Paliers de puces habituels</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelClass}>Gabarit d'accroche (créneaux entre accolades, jamais de texte final)</label>
        <textarea
          className={`${fieldClass} h-16 resize-y`}
          value={value.summaryStructure}
          placeholder="{intitulé} depuis {année}, {spécialités}, {preuve 1}"
          onChange={e => set('summaryStructure', e.target.value)}
        />
      </div>
      <div>
        <label className={labelClass}>Ordre des catégories de compétences (une par ligne)</label>
        <textarea
          className={`${fieldClass} h-20 resize-y font-mono`}
          value={value.skillCategoryOrder.join('\n')}
          onChange={e => set('skillCategoryOrder', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
        />
        {categoryHints.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">Catégories existantes : {categoryHints.join(' · ')}</p>
        )}
      </div>
      <div>
        <label className={labelClass}>Consignes de vocabulaire</label>
        <textarea className={`${fieldClass} h-14 resize-y`} value={value.vocabulary} onChange={e => set('vocabulary', e.target.value)} />
      </div>
    </div>
  );
}
