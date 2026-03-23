/**
 * Google Drive sync for ResumeForge — OAuth2 PKCE + Drive REST API.
 *
 * Setup (once, by the user):
 *  1. Create a project at console.cloud.google.com
 *  2. Enable the Google Drive API
 *  3. Create OAuth2 credentials → type "Application de bureau" (Desktop app)
 *  4. Register these redirect URIs:
 *       http://127.0.0.1          (desktop, any port — Google allows all loopback)
 *       com.jules.resume-forge:/oauth/callback  (Android deep link)
 *  5. Copy the Client ID into the app's settings
 *
 * Scope used: drive.file  — only files created by this app.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getSetting, setSetting } from '@/lib/db';

// ── Constants ─────────────────────────────────────────────────────────────────

// Official ResumeForge Google Client ID for the Approved App (OAuth2 PKCE)
const CLIENT_ID = import.meta.env.VITE_GDRIVE_CLIENT_ID || '1044716768393-27gqj2u0g497b7t5g1u6s9n6k2n5e6c7.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const MOBILE_REDIRECT = 'com.jules.resume-forge:/oauth/callback';
const FOLDER_NAME = 'ResumeForge Backups';

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

async function sha256Base64Url(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Token storage (SQLite settings) ──────────────────────────────────────────

export interface GDriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export async function loadTokens(): Promise<GDriveTokens | null> {
  try {
    const raw = await getSetting('gdrive_tokens');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GDriveTokens;
    // Validate shape
    if (!parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function persistTokens(tokens: GDriveTokens): Promise<void> {
  await setSetting('gdrive_tokens', JSON.stringify(tokens));
}

export async function clearTokens(): Promise<void> {
  await setSetting('gdrive_tokens', '');
}

export async function isConnected(): Promise<boolean> {
  const t = await loadTokens();
  return t !== null;
}

// ── OAuth state (module-level — survives Android background/foreground) ───────
// sessionStorage is unreliable on Android: the WebView can be paused/recreated
// by the OS while the external browser is open, wiping sessionStorage.
// Module-level variables persist as long as the JS runtime is alive.

let _oauthVerifier = '';
let _oauthState = '';
let _oauthRedirectUri = '';

// ── OAuth2 flow ───────────────────────────────────────────────────────────────

/**
 * Kick off the OAuth2 PKCE flow.
 * - Desktop: starts a local HTTP server (Tauri command), uses loopback redirect.
 * - Android: uses the deep-link scheme as redirect URI.
 */
export async function startOAuthFlow(): Promise<void> {
  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(16);

  _oauthVerifier = verifier;
  _oauthState = state;

  let redirectUri: string;
  try {
    // Desktop: start local callback server (command is not available on Android)
    const port = await invoke<number>('start_oauth_server');
    redirectUri = `http://127.0.0.1:${port}/callback`;
  } catch {
    // Mobile: use deep-link URI
    redirectUri = MOBILE_REDIRECT;
  }
  _oauthRedirectUri = redirectUri;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  await openUrl(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

/**
 * Wait for the OAuth2 callback event emitted by the local server (desktop)
 * or forwarded from the deep-link handler in App.tsx (Android).
 * Resolves with the auth code, or null on timeout / state mismatch.
 */
export function waitForOAuthCallback(timeoutMs = 120_000): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let unlisten: (() => void) | null = null;

    const settle = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (unlisten) unlisten();
      resolve(value);
    };

    const timer = setTimeout(() => settle(null), timeoutMs);

    listen<string>('oauth://callback', (event) => {
      const payload = event.payload;
      // payload from desktop: "/callback?code=X&state=Y"
      // payload from mobile:  "?code=X&state=Y"
      const qs = payload.includes('?') ? payload.substring(payload.indexOf('?')) : payload;
      const params = new URLSearchParams(qs);

      if (params.get('state') !== _oauthState) {
        settle(null);
        return;
      }
      settle(params.get('code'));
    }).then(fn => {
      unlisten = fn;
      if (settled) fn(); // already settled before listen resolved
    });
  });
}

/** Exchange the auth code for tokens and persist them. */
export async function exchangeCode(code: string): Promise<void> {
  const verifier = _oauthVerifier;
  const redirectUri = _oauthRedirectUri;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!resp.ok) throw new Error(`Échange de token échoué : ${await resp.text()}`);

  const data = await resp.json();
  await persistTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  });

  _oauthVerifier = '';
  _oauthState = '';
  _oauthRedirectUri = '';
}

async function refreshAccessToken(tokens: GDriveTokens): Promise<GDriveTokens> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    await clearTokens();
    throw new Error('Session expirée — veuillez reconnecter Google Drive.');
  }

  const data = await resp.json();
  const updated: GDriveTokens = {
    ...tokens,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  await persistTokens(updated);
  return updated;
}

async function getValidToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) throw new Error('Non connecté à Google Drive.');
  if (Date.now() >= tokens.expiresAt) {
    const refreshed = await refreshAccessToken(tokens);
    return refreshed.accessToken;
  }
  return tokens.accessToken;
}

// ── Drive folder helper ───────────────────────────────────────────────────────

async function getOrCreateFolder(token: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const listResp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const { files } = await listResp.json();
  if (files?.length) return files[0].id as string;

  const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const folder = await createResp.json();
  return folder.id as string;
}

// ── Public Drive API ──────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size: string;
}

export async function listDriveBackups(): Promise<DriveFile[]> {
  const token = await getValidToken();
  const folderId = await getOrCreateFolder(token);
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime+desc`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  return (data.files ?? []) as DriveFile[];
}

export async function uploadToDrive(
  jsonContent: string,
  fileName: string
): Promise<void> {
  const token = await getValidToken();
  const folderId = await getOrCreateFolder(token);

  const boundary = '-------ResumeForge314159';
  const meta = JSON.stringify({ name: fileName, parents: [folderId] });
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    meta,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    jsonContent,
    `--${boundary}--`,
  ].join('\r\n');

  const resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    }
  );
  if (!resp.ok) throw new Error(`Échec de l'envoi : ${await resp.text()}`);
}

export async function downloadFromDrive(fileId: string): Promise<string> {
  const token = await getValidToken();
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) throw new Error(`Échec du téléchargement : ${resp.status}`);
  return resp.text();
}

