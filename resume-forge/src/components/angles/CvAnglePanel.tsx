import { useEffect, useMemo, useState } from 'react';
import { Compass, Copy, Check, Star, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAngleStore } from '@/stores/angleStore';
import { useProfileStore } from '@/stores/profileStore';
import {
  MAX_ANGLES_PER_PROFILE, resolveAngle, withAffinity, entryTags, type AngleSpec,
} from '@/lib/cv-angles';
import { buildAnglePrompt, parseAnglePropositions, type AnglePropositions, type AngleProposition } from '@/lib/ai-angle-response';
import type { AngleSelection } from '@/lib/cv-angle-selection';
import { displayTitle } from '@/lib/entry-display';
import type { MasterEntry, Profile } from '@/types/profile';
import { AngleFieldsForm, type AngleFormValue } from './AngleFieldsForm';

interface CvAnglePanelProps {
  profile: Profile;
  entries: MasterEntry[];
  offerText: string;
  company?: string;
  personalRules: string;
  selection: AngleSelection;
  onSelectionChange: (selection: AngleSelection) => void;
}

type Mode = 'none' | 'library' | 'propose';

const chip = 'px-2.5 py-1 text-xs rounded-md border transition-colors';
const chipOn = `${chip} bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300`;
const chipOff = `${chip} bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50`;
const small = 'px-2 py-1 text-[11px] rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50';

const fieldsOf = (p: AngleSpec): AngleFormValue => ({
  label: p.label, titleRule: p.titleRule, summaryStructure: p.summaryStructure,
  skillCategoryOrder: [...p.skillCategoryOrder], vocabulary: p.vocabulary, olderPolicy: p.olderPolicy,
});

/**
 * Choix de l'angle du CV, avant la génération.
 * Mode 1 « Ma bibliothèque » (un angle, ou le choix laissé à l'IA) ; mode 2
 * « Proposer selon l'annonce » (passage 1 : 2 à 3 propositions, puis le CV).
 */
export function CvAnglePanel({ profile, entries, offerText, company, personalRules, selection, onSelectionChange }: CvAnglePanelProps) {
  const { angles, profileId, fetchAngles, createAngle, deleteAngle, writeTags } = useAngleStore();
  const library = useMemo(() => (profileId === profile.id ? angles : []), [profileId, profile.id, angles]);
  const [mode, setMode] = useState<Mode>(selection.mode === 'proposal' ? 'propose' : selection.mode === 'none' ? 'none' : 'library');
  const [promptCopied, setPromptCopied] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [edited, setEdited] = useState<Record<number, AngleProposition>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const [replaceId, setReplaceId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchAngles(profile.id); }, [profile.id, fetchAngles]);

  const parsed = useMemo((): { ok: true; value: AnglePropositions } | { ok: false; error: string } | null => {
    if (!jsonInput.trim()) return null;
    try {
      return { ok: true, value: parseAnglePropositions(jsonInput, { entries, librarySlugs: library.map(a => a.slug) }) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'JSON invalide' };
    }
  }, [jsonInput, entries, library]);

  useEffect(() => { setEdited({}); setEditing(null); setChosenIdx(null); }, [jsonInput]);

  const titleOf = (id: string) => {
    const e = entries.find(x => x.id === id);
    return e ? displayTitle(e.title, e.subtitle) : id;
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    if (m === 'none') onSelectionChange({ mode: 'none' });
    if (m === 'library') onSelectionChange(library[0] ? { mode: 'library', angleId: library[0].id } : { mode: 'none' });
    if (m === 'propose') onSelectionChange({ mode: 'none' }); // tant qu'aucune proposition n'est retenue
  };

  const copyAnglePrompt = async () => {
    const prompt = buildAnglePrompt({
      profile, entries, jobOfferText: offerText, targetCompany: company, personalRules,
      library: library.map(a => resolveAngle(a, entries)),
    });
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
      toast.success('Prompt d\'analyse copié');
    } catch {
      toast.error('Erreur lors de la copie');
    }
  };

  const full = library.length >= MAX_ANGLES_PER_PROFILE;

  const saveToLibrary = async (p: AngleProposition) => {
    if (full && !replaceId) { toast.error('Bibliothèque pleine : choisissez l\'angle à remplacer.'); return; }
    setBusy(true);
    try {
      if (full) await deleteAngle(replaceId);
      const created = await createAngle(profile.id, { ...fieldsOf(p), slug: p.slug ?? undefined });
      if (!created) throw new Error('Angle non créé');
      // Affinités de la proposition → tags de l'angle enregistré (ajout seulement).
      const current = useProfileStore.getState().entries;
      const updates = current
        .filter(e => p.leadEntryIds.includes(e.id) || p.hideEntryIds.includes(e.id))
        .map(e => ({ entryId: e.id, tags: withAffinity(entryTags(e), created.slug, p.leadEntryIds.includes(e.id) ? 'lead' : 'hide') }));
      await writeTags(updates);
      onSelectionChange({ mode: 'library', angleId: created.id });
      setMode('library');
      toast.success(`Angle « ${created.label} » enregistré dans la bibliothèque`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Compass className="w-4 h-4 text-indigo-500" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Angle du CV</span>
      </div>
      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Angle du CV">
        {([['none', 'Sans angle'], ['library', 'Ma bibliothèque'], ['propose', 'Proposer selon l\'annonce']] as const).map(([m, label]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? chipOn : chipOff} onClick={() => switchMode(m)}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'library' && (
        library.length === 0 ? (
          <p className="text-xs text-gray-500">Aucun angle : créez-en dans Paramètres, « Angles de CV ».</p>
        ) : (
          <select
            className="w-full p-2 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md"
            value={selection.mode === 'library' ? selection.angleId : selection.mode === 'auto' ? '__auto' : ''}
            onChange={e => onSelectionChange(e.target.value === '__auto' ? { mode: 'auto' } : { mode: 'library', angleId: e.target.value })}
          >
            {library.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            <option value="__auto">Laisser l'IA choisir parmi ma bibliothèque</option>
          </select>
        )
      )}

      {mode === 'propose' && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
            1. Copie le prompt d'analyse et colle-le dans ton IA. 2. Colle sa réponse ci-dessous. 3. Choisis une proposition : le prompt du CV l'utilisera.
          </p>
          <button type="button" className={small} onClick={copyAnglePrompt}>
            {promptCopied ? <><Check className="inline w-3 h-3" /> Copié</> : <><Copy className="inline w-3 h-3" /> Copier le prompt d'analyse</>}
          </button>
          <textarea
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
            placeholder="Réponse JSON de l'analyse (propositions d'angle)"
            className="w-full h-20 p-2 text-xs font-mono border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md resize-y"
          />
          {parsed && !parsed.ok && <p className="text-xs text-red-600">{parsed.error}</p>}
          {parsed?.ok && (
            <div className="space-y-2">
              {parsed.value.analyse?.alertesCap && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 text-[11px] text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="inline w-3 h-3 mr-1" />
                  Alertes sur tes critères : {parsed.value.analyse.alertesCap.join(' ; ')}
                </div>
              )}
              {parsed.value.warnings.length > 0 && (
                <ul className="text-[11px] text-amber-700 dark:text-amber-300 list-disc pl-4">
                  {parsed.value.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              {parsed.value.propositions.map((orig, i) => {
                const p = edited[i] ?? orig;
                const recommended = parsed.value.recommandation?.index === i;
                const chosen = selection.mode === 'proposal' && chosenIdx === i;
                return (
                  <div key={i} className={`rounded-md border p-2.5 space-y-1.5 ${chosen ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">{p.label}</span>
                      {recommended && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          <Star className="inline w-3 h-3" /> Recommandée{parsed.value.recommandation?.raison ? ` : ${parsed.value.recommandation.raison}` : ''}
                        </span>
                      )}
                      {chosen && <span className="text-[10px] text-indigo-600 dark:text-indigo-300">Retenue pour ce CV</span>}
                    </div>
                    {p.pourquoi && <p className="text-[11px] text-gray-600 dark:text-gray-300">{p.pourquoi}</p>}
                    <p className="text-[11px] text-gray-600 dark:text-gray-300"><strong>En tête :</strong> {p.leadEntryIds.map(titleOf).join(' · ')}</p>
                    {p.sacrifie && <p className="text-[11px] text-gray-600 dark:text-gray-300"><strong>Laissé de côté :</strong> {p.sacrifie}</p>}
                    {p.ecarts.length > 0 && <p className="text-[11px] text-gray-600 dark:text-gray-300"><strong>Écarts :</strong> {p.ecarts.join(' ; ')}</p>}
                    {editing === i && (
                      <div className="pt-1">
                        <AngleFieldsForm value={fieldsOf(p)} onChange={v => {
                          const next = { ...p, ...v };
                          setEdited({ ...edited, [i]: next });
                          if (chosen) onSelectionChange({ mode: 'proposal', proposal: next });
                        }} />
                      </div>
                    )}
                    <div className="flex gap-1.5 flex-wrap pt-1">
                      <button type="button" className={small} onClick={() => { setChosenIdx(i); onSelectionChange({ mode: 'proposal', proposal: p }); }}>Utiliser pour ce CV</button>
                      <button type="button" className={small} onClick={() => setEditing(editing === i ? null : i)}>{editing === i ? 'Fermer' : 'Modifier'}</button>
                      <button type="button" className={small} disabled={busy || (full && !replaceId)} onClick={() => saveToLibrary(p)}>
                        Enregistrer dans ma bibliothèque
                      </button>
                    </div>
                  </div>
                );
              })}
              {full && (
                <div className="text-[11px] text-gray-600 dark:text-gray-300 flex items-center gap-2 flex-wrap">
                  Bibliothèque pleine ({MAX_ANGLES_PER_PROFILE} angles) : pour enregistrer, remplacer
                  <select className="p-1 border border-gray-300 rounded text-[11px] dark:bg-gray-800" value={replaceId} onChange={e => setReplaceId(e.target.value)}>
                    <option value="">(choisir)</option>
                    {library.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
