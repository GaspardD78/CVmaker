import { BULLET_FOCUS_OPTIONS, normalizeBulletFocus, type BulletFocus } from '@/lib/cv-focus-rules';

interface BulletFocusSelectProps {
  /** Valeur choisie ; `''` : hérite du réglage du profil (seulement si `inheritFrom` est fourni). */
  value: BulletFocus | '';
  onChange: (value: BulletFocus | '') => void;
  /** Réglage hérité (profil) : ajoute l'option « Hériter du profil » et l'affiche dans son libellé. */
  inheritFrom?: BulletFocus;
  id?: string;
}

/** Orientation des puces du CV : missions et périmètre / résultats chiffrés. Partagé par les Paramètres, le CV et le générateur. */
export function BulletFocusSelect({ value, onChange, inheritFrom, id }: BulletFocusSelectProps) {
  const shown = value || inheritFrom;
  const help = BULLET_FOCUS_OPTIONS.find(o => o.value === shown)?.help;
  const inheritedLabel = BULLET_FOCUS_OPTIONS.find(o => o.value === inheritFrom)?.label;
  return (
    <div>
      <select
        id={id}
        value={value}
        onChange={e => onChange(normalizeBulletFocus(e.target.value) ?? '')}
        className="w-full p-1.5 border rounded text-sm focus:ring focus:ring-blue-200 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
        aria-label="Orientation des puces"
      >
        {inheritFrom && <option value="">Réglage du profil ({inheritedLabel})</option>}
        {BULLET_FOCUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {help && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{help}</p>}
    </div>
  );
}
