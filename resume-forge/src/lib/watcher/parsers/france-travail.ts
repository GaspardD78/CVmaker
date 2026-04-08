/**
 * Parser France Travail (ex Pôle Emploi) — API officielle v2
 *
 * OAuth2 Client Credentials :
 *   POST https://entreprise.francetravail.fr/connexion/oauth2/access_token
 *   scope: "api_offresdemploiv2 o2dsoffre"
 *
 * Recherche d'offres :
 *   GET https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search
 *   Pagination : 2 pages max (150 offres/page), 400ms entre pages
 *   204 = aucun résultat
 *
 * Qualité d'extraction : HIGH — données structurées avec coordonnées GPS natives.
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, ExtractionMetadata } from '@/types/job-watch';
import { buildFranceTravailQuery } from '../profile-to-query';
import { tauriFetch } from '../http';

const FT_TOKEN_URL  = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const FT_SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const PAGE_SIZE     = 150;
const PAGE_DELAY_MS = 400;

// ── OAuth2 token management ──────────────────────────────────────────────────

interface TokenInfo {
  accessToken: string;
  expiresAt:   number; // Unix timestamp ms
}

let tokenCache: TokenInfo | null = null;

export async function getFranceTravailToken(
  clientId:     string,
  clientSecret: string,
): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - now > 60_000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         'api_offresdemploiv2 o2dsoffre',
  });

  const res = await tauriFetch(FT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`France Travail OAuth2 error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt:   now + data.expires_in * 1000,
  };
  return tokenCache.accessToken;
}

export function getTokenCache(): TokenInfo | null {
  return tokenCache;
}

export function restoreTokenCache(accessToken: string, expiresAt: string): void {
  const exp = parseInt(expiresAt, 10);
  if (accessToken && !isNaN(exp) && exp - Date.now() > 60_000) {
    tokenCache = { accessToken, expiresAt: exp };
  }
}

// ── Salary parsing ────────────────────────────────────────────────────────────

interface FtSalaire {
  libelle?:    string;
  commentaire?: string;
}

function parseSalary(salaire?: FtSalaire): { salaryMin: number | null; salaryMax: number | null; salaryRaw: string | null } {
  if (!salaire) return { salaryMin: null, salaryMax: null, salaryRaw: null };

  const raw = [salaire.libelle, salaire.commentaire].filter(Boolean).join(' ');
  if (!raw) return { salaryMin: null, salaryMax: null, salaryRaw: null };

  const nums = raw.replace(/\s/g, '').match(/\d[\d.,]*/g);
  if (!nums) return { salaryMin: null, salaryMax: null, salaryRaw: raw };

  const parsed = nums.map(n => {
    const v = parseFloat(n.replace(',', '.'));
    return v < 1000 ? v * 1000 : v;
  }).filter(v => v >= 10_000 && v <= 500_000);

  return {
    salaryMin: parsed[0] ?? null,
    salaryMax: parsed[1] ?? parsed[0] ?? null,
    salaryRaw: raw,
  };
}

// ── API types ────────────────────────────────────────────────────────────────

interface FtOffer {
  id?:           string;
  intitule?:     string;
  description?:  string;
  dateCreation?: string;
  typeContrat?:  string;
  typeContratLibelle?: string;
  lieuTravail?: {
    libelle?:   string;
    latitude?:  number;
    longitude?: number;
    codePostal?: string;
  };
  entreprise?: {
    nom?: string;
  };
  origineOffre?: {
    urlOrigine?: string;
  };
  salaire?: FtSalaire;
}

interface FtSearchResponse {
  resultats?: FtOffer[];
}

// ── Main parser ──────────────────────────────────────────────────────────────

/**
 * Exponential-backoff retry for transient 5xx errors.
 * France Travail returns HTTP 500 "Erreur technique" fairly regularly; a short
 * retry loop avoids polluting the UI with errors for temporary blips.
 */
async function ftFetchWithRetry(
  url: string,
  token: string,
  attempts = 3,
): Promise<Response> {
  let lastErr: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await tauriFetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept':        'application/json',
        },
      });
      // Retry only on 5xx — 4xx means bad query, no point retrying
      if (res.status >= 500 && res.status < 600 && i < attempts - 1) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
      }
    }
  }
  throw lastErr ?? new Error('France Travail: fetch failed after retries');
}

export async function parseFranceTravail(
  config: JobWatchConfig,
  settings: JobWatchSettings,
): Promise<RawJobOffer[]> {
  const { ftClientId, ftClientSecret } = settings;

  if (!ftClientId || !ftClientSecret) {
    throw new Error('France Travail : client_id et client_secret requis');
  }

  if (!tokenCache && settings.ftAccessToken && settings.ftTokenExpiresAt) {
    restoreTokenCache(settings.ftAccessToken, settings.ftTokenExpiresAt);
  }

  const token  = await getFranceTravailToken(ftClientId, ftClientSecret);
  const offers: RawJobOffer[] = [];

  // Build query from the unified SearchProfile
  const query = buildFranceTravailQuery(settings.searchProfile);

  // Track whether we had to drop the commune parameter after a 400 "commune" error
  let communeDisabled = false;

  for (let page = 0; page < 2; page++) {
    const params = new URLSearchParams();

    if (query.motsCles) params.set('motsCles', query.motsCles);

    // Skip commune if it was rejected on a previous page and fall back to departement
    if (query.commune && !communeDisabled) {
      params.set('commune', query.commune);
    } else if (query.departement) {
      params.set('departement', query.departement);
    }
    if (query.distance)     params.set('distance',    String(query.distance));
    if (query.typeContrat)  params.set('typeContrat', query.typeContrat);

    // LinkedIn RSS uses its own URL; for FT the rssUrl field is ignored
    params.set('range', `${page * PAGE_SIZE}-${(page + 1) * PAGE_SIZE - 1}`);

    let res = await ftFetchWithRetry(`${FT_SEARCH_URL}?${params.toString()}`, token);

    // Graceful fallback: if 400 "commune" error, retry the same page without commune
    if (res.status === 400 && query.commune && !communeDisabled) {
      const text = await res.text().catch(() => '');
      if (/commune/i.test(text)) {
        console.warn(
          `[france-travail] commune "${query.commune}" rejetée par l'API ` +
          `(${text.slice(0, 120)}). Bascule sur departement="${query.departement ?? '(aucun)'}".`
        );
        communeDisabled = true;
        params.delete('commune');
        if (query.departement) params.set('departement', query.departement);
        res = await ftFetchWithRetry(`${FT_SEARCH_URL}?${params.toString()}`, token);
      } else {
        throw new Error(`France Travail search error 400: ${text.slice(0, 200)}`);
      }
    }

    if (res.status === 204) break;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`France Travail search error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as FtSearchResponse;
    const resultats = data.resultats ?? [];

    for (const o of resultats) {
      if (!o.intitule) continue;

      const { salaryMin, salaryMax, salaryRaw } = parseSalary(o.salaire);
      const url = o.origineOffre?.urlOrigine
        ?? (o.id ? `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}` : '');
      if (!url) continue;

      // France Travail is structured API → HIGH confidence on all fields
      const hasCoords = o.lieuTravail?.latitude != null && o.lieuTravail?.longitude != null;
      const extraction: ExtractionMetadata = {
        titleSource:        'api',
        titleConfidence:    'high',
        locationSource:     hasCoords ? 'api_coords' : (o.lieuTravail?.libelle ? 'api_text' : 'none'),
        locationConfidence: hasCoords ? 'high' : (o.lieuTravail?.libelle ? 'high' : 'none'),
        contractSource:     o.typeContrat ? 'api' : 'none',
        contractConfidence: o.typeContrat ? 'high' : 'none',
      };

      offers.push({
        source:             'france_travail',
        url,
        title:              o.intitule,
        company:            o.entreprise?.nom ?? null,
        location:           o.lieuTravail?.libelle ?? null,
        locationLat:        o.lieuTravail?.latitude  ?? null,
        locationLon:        o.lieuTravail?.longitude ?? null,
        contractType:       o.typeContratLibelle ?? o.typeContrat ?? null,
        descriptionSnippet: o.description ? o.description.slice(0, 500) : null,
        publishedAt:        o.dateCreation ?? null,
        salaryMin,
        salaryMax,
        salaryRaw,
        extraction,
      });
    }

    if (resultats.length < PAGE_SIZE) break;
    if (page < 1) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
  }

  return offers;
}
