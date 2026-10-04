import type { CvAngle, Affinity } from '@/lib/cv-angles';
import { entryAffinity, entryTags, nextAffinity } from '@/lib/cv-angles';
import { displayTitle } from '@/lib/entry-display';
import type { EntryType, MasterEntry } from '@/types/profile';

const TYPE_LABELS: Record<EntryType, string> = {
  experience: 'Expériences', education: 'Formations', skill: 'Compétences', certification: 'Certifications',
  language: 'Langues', interest: "Centres d'intérêt", project: 'Projets', volunteer: 'Bénévolat',
};
const TYPE_ORDER: EntryType[] = ['experience', 'skill', 'education', 'certification', 'project', 'language', 'interest', 'volunteer'];

const CELL: Record<Affinity, { text: string; title: string; className: string }> = {
  lead: { text: 'En tête', title: 'Mettre en tête', className: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300' },
  neutral: { text: '·', title: 'Neutre', className: 'bg-white text-gray-400 border-gray-200 dark:bg-gray-800 dark:border-gray-600' },
  hide: { text: 'Masquée', title: 'Masquer par défaut', className: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-700 dark:text-gray-300' },
};

interface AffinityMatrixProps {
  entries: MasterEntry[];
  angles: CvAngle[];
  onChange: (entryId: string, slug: string, affinity: Affinity) => void;
  disabled?: boolean;
}

/** Matrice entrées × angles : chaque cellule (neutre → en tête → masquée) écrit les tags de l'entrée. */
export function AffinityMatrix({ entries, angles, onChange, disabled }: AffinityMatrixProps) {
  if (angles.length === 0) return <p className="text-sm text-gray-500">Aucun angle.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left font-medium text-gray-600 dark:text-gray-300 p-2">Entrée</th>
            {angles.map(a => <th key={a.id} className="font-medium text-gray-600 dark:text-gray-300 p-2 text-center">{a.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {TYPE_ORDER.flatMap(type => {
            const rows = entries.filter(e => e.entryType === type);
            if (rows.length === 0) return [];
            return [
              <tr key={`h-${type}`}>
                <td colSpan={angles.length + 1} className="pt-3 pb-1 text-xs font-semibold uppercase text-gray-500">{TYPE_LABELS[type]}</td>
              </tr>,
              ...rows.map(e => (
                <tr key={e.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="p-2 dark:text-gray-200">
                    {displayTitle(e.title, e.subtitle)}
                    {e.subtitle && <span className="text-gray-400"> - {e.subtitle}</span>}
                  </td>
                  {angles.map(a => {
                    const aff = entryAffinity(entryTags(e), a.slug);
                    const cell = CELL[aff];
                    return (
                      <td key={a.id} className="p-1 text-center">
                        <button
                          type="button"
                          disabled={disabled}
                          title={`${cell.title} (cliquer pour changer)`}
                          aria-label={`${a.label} : ${cell.title}`}
                          onClick={() => onChange(e.id, a.slug, nextAffinity(aff))}
                          className={`min-w-[5.5rem] px-2 py-1 rounded border text-xs ${cell.className} disabled:opacity-50`}
                        >
                          {cell.text}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              )),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
