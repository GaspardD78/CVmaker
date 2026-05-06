import { invoke } from '@tauri-apps/api/core';
import { isAndroid } from '../platform';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

/** Known site identifiers that support session-based scraping */
export type SessionSiteId = 'linkedin' | 'indeed' | 'hellowork' | 'glassdoor' | 'wttj';

export interface ScrapeOptions {
  /** Optional CSS selector to wait for before extracting HTML */
  waitSelector?: string;
  /** Hard timeout in seconds (default: 20) */
  timeoutSecs?: number;
  /** Override user-agent (default: Chrome's native one) */
  userAgent?: string;
}

/** Realistic desktop Chrome UA — keeps us out of obvious bot-detection buckets */
export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Fetch a fully-rendered page through a headless Chrome that carries the
 * user's cookies for `siteId`. Returns the page's HTML after JS rendering.
 *
 * Sur Android : utilise une iframe cachée car elle partage le cookie jar de la WebView.
 */
export async function scrapeWithSession(
  siteId: SessionSiteId,
  url: string,
  opts: ScrapeOptions = {},
  profileId?: string | null,
): Promise<string> {
  if (isAndroid()) {
    return scrapeWithIframe(url, opts.waitSelector, opts.timeoutSecs);
  }

  return invoke<string>('scrape_with_session', {
    siteId,
    url,
    waitSelector: opts.waitSelector ?? null,
    timeoutSecs:  opts.timeoutSecs  ?? 20,
    userAgent:    opts.userAgent    ?? DESKTOP_UA,
    profileId:    profileId ?? null,
  });
}

/**
 * Android-only: Scraping via une iframe cachée.
 */
async function scrapeWithIframe(url: string, waitSelector?: string, timeoutSecs = 30): Promise<string> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout de collecte (Android Iframe) sur ${url}`));
    }, timeoutSecs * 1000);

    const cleanup = () => {
      clearTimeout(timeout);
      document.body.removeChild(iframe);
    };

    iframe.onload = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) throw new Error("Impossible d'accéder au document de l'iframe");

        // On attend un court instant que le JS de la page s'exécute
        setTimeout(() => {
          const html = doc.documentElement.innerHTML;
          cleanup();
          resolve(html);
        }, 3000);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    iframe.onerror = (err) => {
      cleanup();
      reject(new Error(`Erreur de chargement iframe: ${String(err)}`));
    };

    document.body.appendChild(iframe);
  });
}

/**
 * Open a visible Chrome window at `loginUrl` for the user to authenticate.
 *
 * Sur Android : ouvre une nouvelle WebviewWindow Tauri.
 */
export async function openLoginFlow(
  siteId: SessionSiteId,
  loginUrl: string,
  profileId?: string | null,
  userAgent: string = DESKTOP_UA,
): Promise<void> {
  if (isAndroid()) {
    const webview = new WebviewWindow(`login-${siteId}`, {
      url: loginUrl,
      title: `Connexion ${siteId}`,
      width: 800,
      height: 600,
    });
    
    webview.once('tauri://error', (e) => {
      console.error('WebviewWindow error:', e);
    });
    return;
  }

  await invoke('open_login_flow', { siteId, loginUrl, profileId: profileId ?? null, userAgent });
}

/** Close the login browser — call after the user confirms they're logged in. */
export async function closeLoginBrowser(): Promise<void> {
  if (isAndroid()) {
    // Sur Android, on laisse l'utilisateur fermer la fenêtre lui-même ou on ferme la dernière ouverte
    // Mais WebviewWindow.getByLabel est utile ici si on veut forcer.
    return;
  }
  await invoke('close_login_browser');
}

/** Check whether we have persisted cookies for `siteId` on disk. */
export async function sessionExists(siteId: SessionSiteId, profileId?: string | null): Promise<boolean> {
  if (isAndroid()) {
    // Sur Android, on ne peut pas facilement lister les cookies HttpOnly.
    // On renvoie true par défaut, le fetcher gérera l'erreur si la page de login apparaît.
    return true; 
  }
  return invoke<boolean>('session_exists', { siteId, profileId: profileId ?? null });
}

/** Delete the persisted session (force re-login next time). */
export async function clearSession(siteId: SessionSiteId, profileId?: string | null): Promise<void> {
  if (isAndroid()) {
    // Nettoyer les cookies Android nécessite un plugin natif ou une commande spécifique.
    // Pour l'instant on se contente de rediriger vers le login.
    return;
  }
  await invoke('clear_session', { siteId, profileId: profileId ?? null });
}

/** Per-site login URLs used by the UI */
export const LOGIN_URLS: Record<SessionSiteId, string> = {
  linkedin:  'https://www.linkedin.com/login',
  indeed:    'https://secure.indeed.com/auth',
  hellowork: 'https://www.hellowork.com/fr-fr/connexion.html',
  glassdoor: 'https://www.glassdoor.fr/profil/login_input.htm',
  wttj:      'https://www.welcometothejungle.com/fr/signin',
};
