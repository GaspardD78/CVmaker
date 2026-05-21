import { useEffect, useState } from 'react';
import { X, Camera, Save, FolderOpen, Copy, Check, Loader2, Trash2 } from 'lucide-react';
import {
  captureScreenshot,
  saveBugReport,
  readBugReport,
  updateBugReport,
  openBugReportDir,
  DEV_OVERLAY_ATTR,
} from '@/lib/bug-report';

type Mode = { kind: 'create' } | { kind: 'edit'; id: string };

interface Props {
  mode: Mode;
  errorCount: number;
  onClose: () => void;
  onSaved: () => void;
}

/** Création / édition d'un rapport de bug (overlay Dev). */
export function BugReportDialog({ mode, errorCount, onClose, onSaved }: Props) {
  const isEdit = mode.kind === 'edit';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(isEdit ? mode.id : null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (mode.kind === 'edit') {
      void readBugReport(mode.id).then(setMarkdown);
    }
  }, [mode]);

  const capture = async () => {
    setCapturing(true);
    // Laisse le navigateur peindre la fermeture d'éventuels menus avant la capture.
    await new Promise((r) => setTimeout(r, 120));
    const dataUrl = await captureScreenshot();
    setShot(dataUrl);
    setCapturing(false);
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await saveBugReport({ title, description, screenshotDataUrl: shot });
      setMarkdown(res.markdown);
      setSavedId(res.id);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (mode.kind !== 'edit') return;
    setSaving(true);
    try {
      await updateBugReport(mode.id, markdown);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponible */
    }
  };

  const btn = 'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50';

  return (
    <div
      {...{ [DEV_OVERLAY_ATTR]: '' }}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-[min(94vw,640px)] flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">
            {isEdit ? 'Éditer le rapport de bug' : 'Déclarer un bug'}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {isEdit || savedId ? (
            <>
              <p className="text-xs text-gray-500">
                Rapport Markdown (éditable, prêt à transmettre à une IA de code).
              </p>
              <textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                spellCheck={false}
                className="h-72 w-full resize-y rounded-md border border-gray-300 p-2 font-mono text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
              />
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Titre</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex. : Le bouton Export ne répond pas"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Étapes pour reproduire, comportement attendu vs observé…"
                  className="h-28 w-full resize-y rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-600">Capture d'écran</label>
                  <button onClick={capture} disabled={capturing} className={`${btn} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
                    {capturing ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                    {shot ? 'Reprendre' : "Capturer l'écran"}
                  </button>
                </div>
                {shot ? (
                  <div className="relative">
                    <img src={shot} alt="capture" className="max-h-48 w-full rounded-md border border-gray-200 object-contain" />
                    <button
                      onClick={() => setShot(null)}
                      title="Supprimer la capture"
                      className="absolute right-1 top-1 rounded bg-white/90 p-1 text-gray-600 hover:bg-white"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-gray-300 p-3 text-center text-xs text-gray-400">
                    Aucune capture
                  </p>
                )}
              </div>

              <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Les {errorCount} dernière(s) erreur(s) capturée(s) et les infos d'environnement seront jointes automatiquement.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
          {(isEdit || savedId) && (
            <>
              <button onClick={copyMarkdown} className={`${btn} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
                {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />} Copier le Markdown
              </button>
              {savedId && (
                <button onClick={() => void openBugReportDir(savedId)} className={`${btn} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
                  <FolderOpen size={13} /> Ouvrir le dossier
                </button>
              )}
            </>
          )}
          {isEdit ? (
            <button onClick={handleUpdate} disabled={saving} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Enregistrer
            </button>
          ) : savedId ? (
            <button onClick={onClose} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
              Terminé
            </button>
          ) : (
            <button onClick={handleCreate} disabled={saving} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Créer le rapport
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
