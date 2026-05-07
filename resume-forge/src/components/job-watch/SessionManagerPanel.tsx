/**
 * Session Manager UI — per-site login buttons for WebView-based scrapers.
 *
 * The user sees one row per site that supports session scraping. They can:
 *   - See whether a session is already persisted (green badge)
 *   - Click "Se connecter" to open a visible Chrome for login
 *   - Click "J'ai terminé" once logged in → browser closes, cookies flushed
 *   - Click "Supprimer" to forget a session
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { isAndroid } from '@/lib/platform';
import { CheckCircle2, XCircle, LogIn, LogOut, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  sessionExists,
  openLoginFlow,
  closeLoginBrowser,
  clearSession,
  LOGIN_URLS,
  type SessionSiteId,
} from '@/lib/watcher/session-manager';
import { SOURCE_LABELS } from '@/lib/watcher/sources';
import { useAuthStore } from '@/stores/authStore';
import type { JobSource } from '@/types/job-watch';

interface SiteRow {
  id: SessionSiteId;
  label: string;
  requiresAuth: boolean;
  description: string;
}

const SITES: SiteRow[] = [
  { id: 'linkedin',  label: SOURCE_LABELS['linkedin'  as JobSource], requiresAuth: true,
    description: 'Scraping direct (remplace le flux RSS tiers). Login LinkedIn obligatoire.' },
  { id: 'indeed',    label: SOURCE_LABELS['indeed'    as JobSource], requiresAuth: false,
    description: 'Login optionnel — utile pour passer les challenges Cloudflare plus facilement.' },
  { id: 'hellowork', label: SOURCE_LABELS['hellowork' as JobSource], requiresAuth: false,
    description: 'Login optionnel — sauvegarder les candidatures depuis le site.' },
];

export function SessionManagerPanel() {
  const profileId = useAuthStore(s => s.currentUserId);
  const [status, setStatus] = useState<Record<SessionSiteId, boolean>>({
    linkedin: false, indeed: false, hellowork: false, glassdoor: false, wttj: false,
  });
  const [loginInProgress, setLoginInProgress] = useState<SessionSiteId | null>(null);

  const refresh = useCallback(async () => {
    const results = await Promise.all(
      SITES.map(async s => [s.id, await sessionExists(s.id, profileId)] as const),
    );
    setStatus(prev => {
      const next = { ...prev };
      for (const [id, has] of results) next[id] = has;
      return next;
    });
  }, [profileId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleLogin = async (site: SiteRow) => {
    try {
      setLoginInProgress(site.id);
      await openLoginFlow(site.id, LOGIN_URLS[site.id], profileId);
      if (isAndroid()) {
        toast.info(
          `Connecte-toi à ${site.label} dans la fenêtre qui vient de s'ouvrir, puis ferme-la avec le bouton « Fermer » ou retour. Reviens ici et clique sur « J'ai terminé ».`,
          { duration: 8000 },
        );
      } else {
        toast.info(`Une fenêtre Chrome s'est ouverte — connecte-toi à ${site.label} puis clique sur "J'ai terminé".`);
      }
    } catch (err) {
      setLoginInProgress(null);
      toast.error(`Ouverture Chrome : ${err instanceof Error ? err.message : 'erreur'}`);
    }
  };

  const handleFinishLogin = async () => {
    try {
      await closeLoginBrowser();
      setLoginInProgress(null);
      await refresh();
      toast.success('Session enregistrée');
    } catch (err) {
      toast.error(`Fermeture navigateur : ${err instanceof Error ? err.message : 'erreur'}`);
    }
  };

  const handleClear = async (site: SiteRow) => {
    if (!confirm(`Supprimer la session ${site.label} ? Tu devras te reconnecter lors de la prochaine collecte.`)) return;
    try {
      await clearSession(site.id, profileId);
      await refresh();
      toast.success('Session supprimée');
    } catch (err) {
      toast.error(`Suppression : ${err instanceof Error ? err.message : 'erreur'}`);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-blue-800 dark:text-blue-200">
          <p className="font-medium">Comment ça marche</p>
          <p className="mt-1">Chaque source ouvre un Chrome dédié avec ses propres cookies, stockés localement (jamais envoyés). Une seule connexion suffit — les cookies persistent jusqu'à expiration côté site.</p>
        </div>
      </div>

      {SITES.map(site => {
        const connected = status[site.id];
        const isLogging = loginInProgress === site.id;
        return (
          <div
            key={site.id}
            className="flex items-start justify-between gap-3 p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{site.label}</span>
                {connected ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded">
                    <CheckCircle2 className="w-3 h-3" /> Connecté
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                    <XCircle className="w-3 h-3" /> {site.requiresAuth ? 'Non connecté' : 'Optionnel'}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{site.description}</p>
            </div>
            <div className="flex-shrink-0 flex items-center gap-2">
              {isLogging ? (
                <Button size="sm" variant="default" onClick={handleFinishLogin}>
                  <LogOut className="w-3.5 h-3.5 mr-1" /> J'ai terminé
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => handleLogin(site)}>
                  <LogIn className="w-3.5 h-3.5 mr-1" /> {connected ? 'Reconnecter' : 'Se connecter'}
                </Button>
              )}
              {connected && !isLogging && (
                <Button size="sm" variant="ghost" onClick={() => handleClear(site)}>
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
