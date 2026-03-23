import { useState, useEffect, useCallback } from 'react';
import {
  Cloud, CloudOff, Upload, Download, Loader2, CheckCircle2,
  AlertCircle, Unlink, ChevronDown, ChevronUp, Key,
} from 'lucide-react';
import { toast } from 'sonner';
import { confirm as tauriConfirm } from '@tauri-apps/plugin-dialog';
import {
  startOAuthFlow, waitForOAuthCallback, exchangeCode,
  isConnected, clearTokens, listDriveBackups, uploadToDrive, downloadFromDrive,
  loadClientId, saveClientId,
  type DriveFile,
} from '@/lib/gdrive';
import { buildBackupData, importBackup, MODULES, type BackupData, type ImportPlan } from '@/lib/backup';

export function GoogleDriveSync() {
  const [clientId, setClientId] = useState('');
  const [clientIdInput, setClientIdInput] = useState('');
  const [showClientIdForm, setShowClientIdForm] = useState(false);
  const [connected, setConnected] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [working, setWorking] = useState<'connect' | 'upload' | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    setConnected(await isConnected());
  }, []);

  const fetchFiles = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingFiles(true);
    try {
      setFiles(await listDriveBackups(id));
    } catch {
      setConnected(false);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const id = await loadClientId();
      if (id) { setClientId(id); setClientIdInput(id); }
      await checkConnection();
    })();
  }, [checkConnection]);

  useEffect(() => {
    if (connected && clientId) fetchFiles(clientId);
  }, [connected, clientId, fetchFiles]);

  const handleSaveClientId = async () => {
    const trimmed = clientIdInput.trim();
    if (!trimmed) return;
    await saveClientId(trimmed);
    setClientId(trimmed);
    setShowClientIdForm(false);
    toast.success('Client ID enregistré');
  };

  const handleConnect = async () => {
    if (!clientId) { setShowClientIdForm(true); return; }
    if (working) return;
    setWorking('connect');
    setStatus(null);
    try {
      await startOAuthFlow(clientId);
      const code = await waitForOAuthCallback();
      if (!code) throw new Error('Authentification annulée ou délai dépassé.');
      await exchangeCode(code, clientId);
      await checkConnection();
      await fetchFiles(clientId);
      setStatus({ ok: true, message: 'Connecté à Google Drive !' });
    } catch (e) {
      setStatus({ ok: false, message: e instanceof Error ? e.message : 'Erreur de connexion.' });
    } finally {
      setWorking(null);
    }
  };

  const handleDisconnect = async () => {
    await clearTokens();
    setConnected(false);
    setFiles([]);
    setStatus({ ok: true, message: 'Déconnecté de Google Drive.' });
  };

  const handleUpload = async () => {
    if (!clientId || working) return;
    setWorking('upload');
    setStatus(null);
    try {
      const backup = await buildBackupData(MODULES.map(m => m.id));
      const json = JSON.stringify(backup, null, 2);
      const date = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', 'h');
      await uploadToDrive(clientId, json, `resumeforge_backup_${date}.cvmaker`);
      await fetchFiles(clientId);
      setStatus({ ok: true, message: 'Sauvegarde envoyée vers Google Drive.' });
    } catch (e) {
      setStatus({ ok: false, message: e instanceof Error ? e.message : "Échec de l'envoi." });
    } finally {
      setWorking(null);
    }
  };

  const handleDownload = async (file: DriveFile) => {
    if (!clientId || downloadingId) return;

    let confirmed = false;
    try {
      confirmed = await tauriConfirm(
        `Restaurer "${file.name}" ? Les données existantes seront fusionnées.`,
        { title: 'Restaurer depuis Google Drive', kind: 'warning' }
      );
    } catch {
      confirmed = window.confirm(`Restaurer "${file.name}" ?`);
    }
    if (!confirmed) return;

    setDownloadingId(file.id);
    try {
      const raw = await downloadFromDrive(clientId, file.id);
      const backup = JSON.parse(raw) as BackupData;
      if (!backup.__cvmaker_backup) throw new Error('Fichier invalide.');
      const plan: ImportPlan = Object.fromEntries(MODULES.map(m => [m.id, 'merge'])) as ImportPlan;
      await importBackup(backup, plan);
      toast.success(`Données restaurées depuis "${file.name}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Échec de la restauration.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
      <div className="p-6 border-b dark:border-gray-700">
        <div className="flex items-center gap-2 mb-1">
          <Cloud size={18} className="text-blue-500" />
          <h2 className="text-base font-semibold dark:text-gray-100">Synchronisation Google Drive</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Sauvegardez et synchronisez vos données entre PC et mobile via Google Drive.
        </p>
      </div>

      <div className="p-6 space-y-4">
        {/* Client ID config */}
        <div>
          <button
            onClick={() => setShowClientIdForm(v => !v)}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <Key size={13} />
            {clientId ? 'Modifier le Client ID' : 'Configurer le Client ID Google'}
            {showClientIdForm ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showClientIdForm && (
            <div className="mt-3 space-y-2">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md text-xs text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-medium">Configuration Google Cloud (une seule fois) :</p>
                <ol className="list-decimal list-inside space-y-0.5 text-blue-700 dark:text-blue-400">
                  <li>Créer un projet sur console.cloud.google.com</li>
                  <li>Activer l'API Google Drive</li>
                  <li>Créer des identifiants OAuth 2.0 → "Application de bureau"</li>
                  <li>
                    Ajouter les URIs de redirection autorisées :{' '}
                    <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">http://127.0.0.1</code>
                    {' '}(PC) et{' '}
                    <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">com.jules.resume-forge:/oauth/callback</code>
                    {' '}(Android)
                  </li>
                </ol>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={clientIdInput}
                  onChange={e => setClientIdInput(e.target.value)}
                  placeholder="1234567890-xxxx.apps.googleusercontent.com"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
                />
                <button
                  onClick={handleSaveClientId}
                  disabled={!clientIdInput.trim()}
                  className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Status feedback */}
        {status && (
          <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${
            status.ok
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          }`}>
            {status.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {status.message}
          </div>
        )}

        {/* Connect / Disconnect */}
        {!connected ? (
          <div className="space-y-2">
            {!clientId && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle size={12} /> Configurez d'abord votre Client ID Google ci-dessus.
              </p>
            )}
            <button
              onClick={handleConnect}
              disabled={working === 'connect' || !clientId}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {working === 'connect'
                ? <><Loader2 size={15} className="animate-spin" /> Connexion en cours…</>
                : <><Cloud size={15} /> Connecter Google Drive</>}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium">
                <CheckCircle2 size={15} /> Connecté à Google Drive
              </span>
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                <Unlink size={12} /> Déconnecter
              </button>
            </div>

            <button
              onClick={handleUpload}
              disabled={!!working}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {working === 'upload'
                ? <><Loader2 size={14} className="animate-spin" /> Envoi en cours…</>
                : <><Upload size={14} /> Sauvegarder vers Drive</>}
            </button>

            {/* Backup list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Sauvegardes dans Drive
                </p>
                <button
                  onClick={() => fetchFiles(clientId)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Actualiser
                </button>
              </div>

              {loadingFiles ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 size={14} className="animate-spin" /> Chargement…
                </div>
              ) : files.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                  <CloudOff size={16} /> Aucune sauvegarde dans Drive.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {files.map(f => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{f.name}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(f.modifiedTime).toLocaleString('fr-FR')}
                          {f.size && ` · ${Math.round(Number(f.size) / 1024)} Ko`}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDownload(f)}
                        disabled={!!downloadingId}
                        title="Restaurer cette sauvegarde"
                        className="ml-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:hover:text-blue-400 font-medium px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50 transition-colors shrink-0"
                      >
                        {downloadingId === f.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Download size={12} />}
                        Restaurer
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
