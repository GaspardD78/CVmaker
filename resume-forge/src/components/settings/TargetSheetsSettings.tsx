import { useEffect, useRef, useState } from 'react';
import { Target } from 'lucide-react';
import { useProfileStore } from '@/stores/profileStore';
import { usePromptStore } from '@/stores/promptStore';
import type { SheetOverrides } from '@/lib/cv-targets';
import { TargetSheetsEditor } from './TargetSheetsEditor';

/** Paramètres : fiches de ciblage du profil actif (type de structure), à côté des angles. */
export function TargetSheetsSettings() {
  const { profile } = useProfileStore();
  const { targetSheets, targetSheetsProfileId, loadTargetSheets, saveTargetSheets } = usePromptStore();
  const [draft, setDraft] = useState<SheetOverrides>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (profile) void loadTargetSheets(profile.id); }, [profile?.id, loadTargetSheets]);
  useEffect(() => {
    if (profile && targetSheetsProfileId === profile.id) setDraft(targetSheets);
  }, [profile?.id, targetSheets, targetSheetsProfileId]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handleChange = (next: SheetOverrides) => {
    setDraft(next);
    if (!profile) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveTargetSheets(profile.id, next); }, 500);
  };

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
      <div className="p-6 border-b dark:border-gray-700">
        <div className="flex items-center gap-2 mb-1">
          <Target size={18} className="text-indigo-500" />
          <h2 className="text-base font-semibold dark:text-gray-100">Fiches de ciblage</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Propres au profil {profile ? `« ${profile.firstName} ${profile.lastName} »` : 'actif'}. Une fiche décrit ce que lit chaque type de
          structure (attentes, vocabulaire, orientation). Ce sont des consignes de rédaction : elles n'ajoutent aucun fait au CV.
        </p>
      </div>
      <div className="p-6">
        <TargetSheetsEditor overrides={draft} onChange={handleChange} />
      </div>
    </section>
  );
}
