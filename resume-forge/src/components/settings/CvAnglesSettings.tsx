import { useEffect, useMemo, useState } from 'react';
import { Compass, Pencil, Trash2, Plus, FileUp } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { useAngleStore } from '@/stores/angleStore';
import { useProfileStore } from '@/stores/profileStore';
import {
  MAX_ANGLES_PER_PROFILE, DEFAULT_ANGLES, parseAffinityFile, planAffinityImport,
  type AffinityImportPlan, type CvAngle,
} from '@/lib/cv-angles';
import { AngleFieldsForm, type AngleFormValue } from '@/components/angles/AngleFieldsForm';
import { AffinityMatrix } from '@/components/angles/AffinityMatrix';

const btn = 'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary = `${btn} bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700`;
const btnGhost = `${btn} border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700`;

const toForm = (a: Pick<CvAngle, keyof AngleFormValue>): AngleFormValue => ({
  label: a.label, titleRule: a.titleRule, summaryStructure: a.summaryStructure,
  skillCategoryOrder: [...a.skillCategoryOrder], vocabulary: a.vocabulary, olderPolicy: a.olderPolicy,
});

/** Bouton « Nouvel angle », désactivé au plafond (4 angles par profil). */
export function NewAngleButton({ count, onClick }: { count: number; onClick: () => void }) {
  const full = count >= MAX_ANGLES_PER_PROFILE;
  return (
    <button
      type="button"
      className={btnPrimary}
      disabled={full}
      onClick={onClick}
      title={full ? `${MAX_ANGLES_PER_PROFILE} angles au maximum : supprimez-en un pour en créer un autre.` : undefined}
    >
      <Plus size={14} /> Nouvel angle {full && `(${MAX_ANGLES_PER_PROFILE} au maximum)`}
    </button>
  );
}

/** Récapitulatif d'un import d'affinités, avant écriture. */
export function AffinityImportSummary({ plan, onConfirm, onCancel, busy }: {
  plan: AffinityImportPlan; onConfirm: () => void; onCancel: () => void; busy?: boolean;
}) {
  return (
    <div className="border border-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 space-y-2 text-sm">
      <p className="font-medium dark:text-gray-100">Récapitulatif avant écriture</p>
      <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300">
        <li>{plan.matched} entrée(s) du fichier retrouvée(s) dans le profil.</li>
        <li>{plan.addedTagCount} tag(s) ajouté(s) sur {plan.updates.length} entrée(s). Aucun tag existant n'est retiré.</li>
        <li>{plan.unmatched.length} entrée(s) du fichier sans correspondance.</li>
      </ul>
      {plan.updates.length > 0 && (
        <details>
          <summary className="cursor-pointer text-gray-600 dark:text-gray-400">Détail des ajouts</summary>
          <ul className="mt-1 text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
            {plan.updates.map(u => <li key={u.entryId}>{u.title} : {u.added.join(', ')}</li>)}
          </ul>
        </details>
      )}
      {plan.unmatched.length > 0 && (
        <details>
          <summary className="cursor-pointer text-gray-600 dark:text-gray-400">Sans correspondance</summary>
          <ul className="mt-1 text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
            {plan.unmatched.map((r, i) => <li key={i}>{r.entryType} : {r.title}</li>)}
          </ul>
        </details>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" className={btnPrimary} disabled={busy || plan.updates.length === 0} onClick={onConfirm}>Confirmer l'import</button>
        <button type="button" className={btnGhost} disabled={busy} onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

/** Paramètres : bibliothèque d'angles de CV (4 au maximum) et matrice d'affinité. */
export function CvAnglesSettings() {
  const { profile, entries } = useProfileStore();
  const { angles, profileId, fetchAngles, createAngle, updateAngle, deleteAngle, setAffinity, writeTags, error } = useAngleStore();
  const [editing, setEditing] = useState<{ id: string | null; value: AngleFormValue } | null>(null);
  const [importPlan, setImportPlan] = useState<AffinityImportPlan | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) fetchAngles(profile.id);
  }, [profile?.id, fetchAngles]);

  const ownAngles = profile && profileId === profile.id ? angles : [];
  const categoryHints = useMemo(
    () => entries.filter(e => e.entryType === 'skill' && /^\s*[-*]\s/m.test(e.description ?? '')).map(e => e.title),
    [entries],
  );

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveEditing = () => editing && profile && run(async () => {
    if (!editing.value.label.trim()) throw new Error('Le nom de l\'angle est obligatoire.');
    if (editing.id) await updateAngle(editing.id, editing.value);
    else await createAngle(profile.id, editing.value);
    setEditing(null);
  }, 'Angle enregistré');

  const remove = (a: CvAngle) => {
    if (!window.confirm(`Supprimer l'angle « ${a.label} » ? Ses tags « angle:${a.slug} » et « hide:${a.slug} » seront retirés des entrées (les autres étiquettes restent).`)) return;
    run(() => deleteAngle(a.id), 'Angle supprimé');
  };

  const pickAffinityFile = () => run(async () => {
    const path = await open({ multiple: false, filters: [{ name: 'Affinités (JSON)', extensions: ['json'] }] });
    if (!path || Array.isArray(path)) return;
    const { rows, errors } = parseAffinityFile(await readTextFile(path as string));
    if (errors.length > 0) toast.warning(`${errors.length} ligne(s) invalide(s) ignorée(s).`);
    setImportPlan(planAffinityImport(rows, entries));
  });

  const confirmImport = () => importPlan && run(async () => {
    await writeTags(importPlan.updates.map(u => ({ entryId: u.entryId, tags: u.tags })));
    setImportPlan(null);
  }, 'Affinités importées');

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
      <div className="p-6 border-b dark:border-gray-700">
        <div className="flex items-center gap-2 mb-1">
          <Compass size={18} className="text-indigo-500" />
          <h2 className="text-base font-semibold dark:text-gray-100">Angles de CV</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Un angle oriente la sélection et l'ordre du CV pour un type de poste ({MAX_ANGLES_PER_PROFILE} au maximum par profil).
          Il ne contient aucun fait : la mise en tête et le masquage se règlent dans la matrice, par entrée.
        </p>
      </div>

      <div className="p-6 space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {ownAngles.map(a => (
            <li key={a.id} className="py-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium dark:text-gray-100">{a.label} <span className="text-xs text-gray-400">({a.slug})</span></p>
                <p className="text-xs text-gray-500">{a.summaryStructure || 'Accroche libre'}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" className={btnGhost} disabled={busy} onClick={() => setEditing({ id: a.id, value: toForm(a) })}><Pencil size={14} /> Modifier</button>
                <button type="button" className={btnGhost} disabled={busy} onClick={() => remove(a)}><Trash2 size={14} /> Supprimer</button>
              </div>
            </li>
          ))}
        </ul>

        {editing ? (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium dark:text-gray-100">{editing.id ? 'Modifier l\'angle' : 'Nouvel angle'}</p>
            <AngleFieldsForm value={editing.value} onChange={value => setEditing({ ...editing, value })} categoryHints={categoryHints} />
            <div className="flex gap-2">
              <button type="button" className={btnPrimary} disabled={busy} onClick={saveEditing}>Enregistrer</button>
              <button type="button" className={btnGhost} disabled={busy} onClick={() => setEditing(null)}>Annuler</button>
            </div>
          </div>
        ) : (
          <NewAngleButton
            count={ownAngles.length}
            onClick={() => setEditing({ id: null, value: { ...toForm(DEFAULT_ANGLES[0]), label: '', summaryStructure: '', skillCategoryOrder: [], vocabulary: '' } })}
          />
        )}

        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold dark:text-gray-100">Affinités des entrées</h3>
            <button type="button" className={btnGhost} disabled={busy || !profile} onClick={pickAffinityFile}>
              <FileUp size={14} /> Importer des affinités
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            Cliquer une cellule fait passer l'entrée de neutre à « en tête », puis « masquée ». Le fichier importé est un JSON local,
            jamais versionné : ses tags sont ajoutés aux entrées après confirmation, sans rien retirer.
          </p>
          {importPlan && (
            <div className="mb-3">
              <AffinityImportSummary plan={importPlan} busy={busy} onConfirm={confirmImport} onCancel={() => setImportPlan(null)} />
            </div>
          )}
          <AffinityMatrix
            entries={entries}
            angles={ownAngles}
            disabled={busy}
            onChange={(entryId, slug, affinity) => run(() => setAffinity(entryId, slug, affinity))}
          />
        </div>
      </div>
    </section>
  );
}
