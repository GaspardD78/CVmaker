/**
 * Parser France Travail (ex Pôle Emploi) — API officielle v2
 *
 * OAuth2 Client Credentials :
 *   POST https://entreprise.francetravail.fr/connexion/oauth2/access_token
 *   scope: "api_offresdemploiv2 o2dsoffre"
 *
 * Recherche d'offres :
 *   GET https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search
 *   Pagination : 2 pages max (offresParPage=150), 400ms entre pages
 *   204 = aucun résultat
 */

import { RawJobOffer } from '@/types/job-watch';
import type { JobWatchConfig, JobWatchSettings } from '@/types/job-watch';
import { tauriFetch } from '../http';

const FT_TOKEN_URL  = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const FT_SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const PAGE_SIZE     = 150;
const PAGE_DELAY_MS = 400;

// ── OAuth2 token management ──────────────────────────────────────────────────

interface TokenInfo {
  accessToken:  string;
  expiresAt:    number; // Unix timestamp ms
}

/** In-memory token cache (process lifetime) */
let tokenCache: TokenInfo | null = null;

export async function getFranceTravailToken(
  clientId:     string,
  clientSecret: string
): Promise<string> {
  const now = Date.now();

  // Reuse if valid for at least 60s more
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

/** Expose token cache so the store can persist it */
export function getTokenCache(): TokenInfo | null {
  return tokenCache;
}

/** Restore token from persisted settings on startup */
export function restoreTokenCache(accessToken: string, expiresAt: string): void {
  const exp = parseInt(expiresAt, 10);
  if (accessToken && !isNaN(exp) && exp - Date.now() > 60_000) {
    tokenCache = { accessToken, expiresAt: exp };
  }
}

// ── Salary parsing ────────────────────────────────────────────────────────────

interface FtSalaire {
  libelle?: string;
  commentaire?: string;
}

function parseSalary(salaire?: FtSalaire): { salaryMin: number | null; salaryMax: number | null; salaryRaw: string | null } {
  if (!salaire) return { salaryMin: null, salaryMax: null, salaryRaw: null };

  const raw = [salaire.libelle, salaire.commentaire].filter(Boolean).join(' ');
  if (!raw) return { salaryMin: null, salaryMax: null, salaryRaw: null };

  // Extract numbers — handles "28K€ - 35K€", "30 000 - 40 000 €", "45000"
  const nums = raw.replace(/\s/g, '').match(/\d[\d.,]*/g);
  if (!nums) return { salaryMin: null, salaryMax: null, salaryRaw: raw };

  const parsed = nums.map(n => {
    const v = parseFloat(n.replace(',', '.'));
    // Convert K notation
    return v < 1000 ? v * 1000 : v;
  }).filter(v => v >= 1000 && v <= 500_000);

  return {
    salaryMin: parsed[0]  ?? null,
    salaryMax: parsed[1]  ?? parsed[0] ?? null,
    salaryRaw: raw,
  };
}

// ── API types ────────────────────────────────────────────────────────────────

interface FtOffer {
  id?:               string;
  intitule?:         string;
  description?:      string;
  dateCreation?:     string;
  typeContrat?:      string;
  lieuTravail?: {
    libelle?:   string;
    latitude?:  number;
    longitude?: number;
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

export async function parseFranceTravail(
  config: JobWatchConfig,
  settings: JobWatchSettings
): Promise<RawJobOffer[]> {
  const { ftClientId, ftClientSecret } = settings;

  if (!ftClientId || !ftClientSecret) {
    throw new Error('France Travail : client_id et client_secret requis');
  }

  // Restore persisted token if any
  if (!tokenCache && settings.ftAccessToken && settings.ftTokenExpiresAt) {
    restoreTokenCache(settings.ftAccessToken, settings.ftTokenExpiresAt);
  }

  const token  = await getFranceTravailToken(ftClientId, ftClientSecret);
  const offers: RawJobOffer[] = [];

  for (let page = 0; page < 2; page++) {
    const params = new URLSearchParams();
    if (config.keywords.length > 0) params.set('motsCles', config.keywords.join(' '));
    if (config.location)            params.set('commune', config.location);
    if (config.ftDeptCode)          params.set('departement', config.ftDeptCode);
    if (config.radiusKm)            params.set('distance', String(config.radiusKm));
    params.set('range', `${page * PAGE_SIZE}-${(page + 1) * PAGE_SIZE - 1}`);

    const res = await tauriFetch(`${FT_SEARCH_URL}?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept':        'application/json',
      },
    });

    // 204 = no results
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

      offers.push({
        source:             'france_travail',
        url,
        title:              o.intitule,
        company:            o.entreprise?.nom ?? null,
        location:           o.lieuTravail?.libelle ?? null,
        locationLat:        o.lieuTravail?.latitude  ?? null,
        locationLon:        o.lieuTravail?.longitude ?? null,
        contractType:       o.typeContrat ?? null,
        descriptionSnippet: o.description ? o.description.slice(0, 500) : null,
        publishedAt:        o.dateCreation ?? null,
        salaryMin,
        salaryMax,
        salaryRaw,
      });
    }

    // No more pages if fewer than PAGE_SIZE results
    if (resultats.length < PAGE_SIZE) break;

    // Delay between pages to respect quota
    if (page < 1) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
  }

  return offers;
}
