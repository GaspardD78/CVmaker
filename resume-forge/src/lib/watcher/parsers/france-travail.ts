/**
 * Parser France Travail (ex Pôle Emploi) — API officielle v2
 *
 * OAuth2 Client Credentials :
 *   POST https://entreprise.francetravail.fr/connexion/oauth2/access_token
 *   scope: "api_offresdemploiv2 o2dsoffre"
 *
 * Recherche d'offres :
 *   GET https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search
 *   - Pagination : `range` query param, max **0-1149** par requête (≠ 0-299).
 *   - 200 OK = page complète, 206 Partial Content = page tronquée (succès aussi).
 *   - 204 No Content = aucun résultat.
 *   - Rate limit ~3 req/s par token → on étale les requêtes (THROTTLE_MS).
 *   - Header de réponse `Content-Range: offres 0-149/<total>` indique le total.
 *
 * Stratégie de rappel :
 *   - `motsCles` ne supporte AUCUN booléen (espace = AND implicite). On itère
 *     sur chaque jobTitle et on déduplique par `id` côté client.
 *   - `typeContrat` est CSV — on envoie tous les types souhaités en un coup.
 *   - `publieeDepuis=7` limite au flux récent (mode veille).
 *   - `sort=1` (date décroissante) — on veut les plus fraîches en premier.
 *   - 4 pages max par titre (600 offres/titre) ; arrêt anticipé si Content-Range
 *     indique qu'on a tout ramené.
 *
 * Qualité d'extraction : HIGH — données structurées + coordonnées GPS natives.
 */

import type { RawJobOffer, JobWatchConfig, JobWatchSettings, ExtractionMetadata } from '@/types/job-watch';
import { buildFranceTravailQuery, isExcludedByProfile, isValidInseeCode } from '../profile-to-query';
import { resolveProfileGeo } from '../geo';
import { tauriFetch } from '../http';

const FT_TOKEN_URL  = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const FT_SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';

/** Taille de page max imposée par l'API. */
const PAGE_SIZE     = 150;
/** Pages max par titre — `range` ne peut pas dépasser 1149 (8 pages × 150). */
const MAX_PAGES_PER_TITLE = 4;
/** Index de fin maximal autorisé par l'API (`range=...-1149`). */
const FT_MAX_END_INDEX = 1149;
/** Throttle ~3 req/s = 350 ms entre requêtes pour rester sous la limite. */
const THROTTLE_MS = 350;

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
 *
 * Note : `200` ET `206 Partial Content` sont tous deux des succès — `206` est
 * renvoyé quand l'API tronque la page (cas le plus fréquent quand on demande
 * une fenêtre de 150 offres avec un total > 150). `res.ok` couvre les deux.
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

/**
 * Parse l'en-tête `Content-Range: offres 0-149/4567` → `{ total: 4567 }`.
 * Permet de s'arrêter dès qu'on a tout ramené, sans pages vides inutiles.
 */
function parseContentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const m = header.match(/\/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

export async function parseFranceTravail(
  _config: JobWatchConfig,
  settings: JobWatchSettings,
): Promise<RawJobOffer[]> {
  const { ftClientId, ftClientSecret } = settings;

  // Missing credentials = source needs configuration, not a runtime error.
  // Returning [] makes the source appear as "empty" in the fetch log (instead
  // of "error") and avoids spamming console.error on every fetch cycle until
  // the user enters their keys in Settings.
  if (!ftClientId || !ftClientSecret) {
    console.info('[france-travail] client_id/client_secret non configurés — source ignorée.');
    return [];
  }

  if (!tokenCache && settings.ftAccessToken && settings.ftTokenExpiresAt) {
    restoreTokenCache(settings.ftAccessToken, settings.ftTokenExpiresAt);
  }

  const token   = await getFranceTravailToken(ftClientId, ftClientSecret);
  const profile = settings.searchProfile;

  // FT's `motsCles` only supports implicit AND (no OR). Joining multiple titles
  // avec des espaces requiert que TOUS les mots soient présents — donc on émet
  // une requête par titre et on déduplique par `id` côté client. Si aucun titre
  // n'est défini, une requête sans `motsCles` ramène toutes les offres du
  // périmètre géographique (utile pour un tri par pertinence post-fetch).
  const query = buildFranceTravailQuery(profile);

  // Filet de sécurité géographique : sans `commune` NI `departement`, la
  // recherche couvre la France entière. Cas typique : profil ancien ou
  // pré-rempli depuis le CV où `inseeCode`/`departmentCodes` n'ont jamais été
  // renseignés alors qu'une ville l'est. On résout alors la commune au moment
  // du fetch via geo.api.gouv.fr (résultat mis en cache pour la session).
  if (!query.commune && !query.departement) {
    const zone = await resolveProfileGeo(profile.location);
    if (zone?.inseeCode && isValidInseeCode(zone.inseeCode)) {
      query.commune = zone.inseeCode;
      query.departement = zone.deptCode ?? undefined;
      console.info(
        `[france-travail] localisation résolue au fetch : commune=${zone.inseeCode}` +
        ` (dept=${zone.deptCode ?? '?'}) pour "${profile.location.city || profile.location.label}".`,
      );
    } else if (zone?.deptCode) {
      query.departement = zone.deptCode;
    } else if (profile.location.city || profile.location.label) {
      console.warn(
        '[france-travail] aucune commune/département résoluble — la recherche partira sans filtre ' +
        'géographique serveur (le post-filtre local écartera les offres hors zone).',
      );
    }
  }

  const queries: (string | undefined)[] = query.titles.length > 0 ? query.titles : [undefined];

  // Sticky : si une commune INSEE est rejetée sur la première requête, on bascule
  // définitivement sur `departement` pour toutes les requêtes suivantes.
  let communeDisabled = false;
  const offersById = new Map<string, RawJobOffer>();

  // Construit la base de paramètres communs (location, contrat, fenêtre de
  // fraîcheur, tri date). Recalculé pour chaque requête car `commune` peut
  // basculer en cours de boucle.
  const baseParams = (): URLSearchParams => {
    const p = new URLSearchParams();
    if (query.commune && !communeDisabled) {
      p.set('commune', query.commune);
      // `distance` ne s'applique qu'à `commune`. 0 est une valeur légitime
      // (« commune uniquement ») et doit être transmise explicitement, sinon
      // l'API applique son défaut de 10 km.
      if (query.distance != null) p.set('distance', String(query.distance));
    } else if (query.departement) {
      p.set('departement', query.departement);
    }
    if (query.typeContrat)   p.set('typeContrat',   query.typeContrat);
    if (query.publieeDepuis) p.set('publieeDepuis', String(query.publieeDepuis));
    // sort=1 = date publication décroissante. On veut les nouvelles offres
    // d'abord — combine bien avec publieeDepuis pour un mode veille.
    p.set('sort', '1');
    return p;
  };

  // Throttle : on espace toutes les requêtes d'au moins THROTTLE_MS pour rester
  // sous les 3 req/s admis par l'API. Un timestamp partagé évite de se cumuler
  // entre titres et pages.
  let lastReqTs = 0;
  const throttle = async () => {
    const elapsed = Date.now() - lastReqTs;
    if (elapsed < THROTTLE_MS) {
      await new Promise(r => setTimeout(r, THROTTLE_MS - elapsed));
    }
    lastReqTs = Date.now();
  };

  for (let t = 0; t < queries.length; t++) {
    const motsCles = queries[t];

    for (let page = 0; page < MAX_PAGES_PER_TITLE; page++) {
      const params = baseParams();
      if (motsCles) params.set('motsCles', motsCles);

      const start = page * PAGE_SIZE;
      const end   = Math.min(start + PAGE_SIZE - 1, FT_MAX_END_INDEX);
      params.set('range', `${start}-${end}`);

      await throttle();
      let res = await ftFetchWithRetry(`${FT_SEARCH_URL}?${params.toString()}`, token);

      // Graceful fallback: if 400 "commune" error, retry without commune
      if (res.status === 400 && query.commune && !communeDisabled) {
        const text = await res.text().catch(() => '');
        if (/commune/i.test(text)) {
          console.warn(
            `[france-travail] commune "${query.commune}" rejetée par l'API ` +
            `(${text.slice(0, 120)}). Bascule sur departement="${query.departement ?? '(aucun)'}".`,
          );
          communeDisabled = true;
          // Retry avec les paramètres réglés sur le nouveau mode (departement).
          const retryParams = baseParams();
          if (motsCles) retryParams.set('motsCles', motsCles);
          retryParams.set('range', `${start}-${end}`);
          await throttle();
          res = await ftFetchWithRetry(`${FT_SEARCH_URL}?${retryParams.toString()}`, token);
        } else {
          throw new Error(`France Travail search error 400: ${text.slice(0, 200)}`);
        }
      }

      // 204 = pas d'offres pour ce critère ; on passe au titre suivant.
      if (res.status === 204) break;

      // 200 OK = page complète, 206 Partial Content = page tronquée. Les deux
      // sont des succès et `res.ok` couvre les deux.
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`France Travail search error ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json() as FtSearchResponse;
      const resultats = data.resultats ?? [];
      const total = parseContentRangeTotal(res.headers.get('Content-Range'));

      for (const o of resultats) {
        if (!o.intitule || !o.id) continue;

        // On déduplique par `id` (UID stable côté FT) et non par URL : certaines
        // offres ont une `urlOrigine` partenaire qui peut varier en cours de
        // diffusion alors que l'`id` reste constant.
        if (offersById.has(o.id)) continue;

        const url = o.origineOffre?.urlOrigine
          ?? `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}`;

        const { salaryMin, salaryMax, salaryRaw } = parseSalary(o.salaire);

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

        offersById.set(o.id, {
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

      // Stop early if Content-Range tells us we've consumed everything.
      if (total != null && end + 1 >= total) break;
      // Stop early if API returned a partial page (last page reached).
      if (resultats.length < PAGE_SIZE) break;
    }
  }

  // FT doesn't support server-side exclusion operators — apply post-filter locally
  const offers = Array.from(offersById.values()).filter(o => {
    const text = `${o.title} ${o.company ?? ''} ${o.descriptionSnippet ?? ''}`;
    return !isExcludedByProfile(text, profile);
  });

  return offers;
}
