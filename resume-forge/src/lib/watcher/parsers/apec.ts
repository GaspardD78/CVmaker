/**
 * Parser APEC — API CMS interne (rechercheOffre)
 *
 * L'API POST https://www.apec.fr/cms/webservices/rechercheOffre renvoie du
 * JSON encodé en ISO-8859-1 / Windows-1252 (serveur legacy).
 * tauri-plugin-http échoue avec "invalid utf-8 sequence" lors de la
 * sérialisation IPC. On passe donc par la commande Rust `fetch_apec_api`.
 *
 * Qualité d'extraction : HIGH (titre API) / MEDIUM (lieu API text) / HIGH (contrat code).
 */

import { invoke } from '@tauri-apps/api/core';
import type { RawJobOffer, JobWatchConfig, JobWatchSettings, ExtractionMetadata } from '@/types/job-watch';
import { buildApecQuery } from '../profile-to-query';
import { isExcludedByProfile } from '../profile-to-query';

const APEC_OFFER_BASE = 'https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre';
const PAGE_SIZE = 20;

const CONTRACT_TYPE_MAP: Record<number, string> = {
  101888: 'CDI',
  101887: 'CDD',
  101886: 'Intérim',
  101885: 'Stage',
  101884: 'Alternance',
};

interface ApecSearchResult {
  numeroOffre:      string;
  intitule:         string;
  nomCommercial?:   string;
  lieuTexte?:       string;
  salaireTexte?:    string;
  texteOffre?:      string;
  datePublication?: string;
  latitude?:        string;
  longitude?:       string;
  typeContrat?:     number;
}

interface ApecSearchResponse {
  resultats: ApecSearchResult[];
  totalCount: number;
}

function parseSalary(raw: string | undefined): { min: number | null; max: number | null; raw: string | null } {
  if (!raw) return { min: null, max: null, raw: null };
  const match = raw.match(/(\d+)\s*[-–à]\s*(\d+)\s*k/i);
  if (match) return { min: Number(match[1]) * 1000, max: Number(match[2]) * 1000, raw };
  const single = raw.match(/(\d+)\s*k/i);
  if (single) return { min: Number(single[1]) * 1000, max: null, raw };
  return { min: null, max: null, raw };
}

export async function parseApec(
  config: JobWatchConfig,
  settings: JobWatchSettings,
): Promise<RawJobOffer[]> {
  const profile = settings.searchProfile;
  const query   = buildApecQuery(profile);

  const body = {
    motsCles:          query.motsCles,
    lieux:             query.lieux,
    typesContrat:      query.typesContrat,
    niveauxExperience: [],
    typeClient:        'CADRE',
    sorts:             [{ type: 'DATE', direction: 'DESCENDING' }],
    pagination:        { range: PAGE_SIZE, startIndex: 0 },
    activeFiltre:      true,
  };

  console.debug('[apec] Search body:', JSON.stringify(body));

  const text = await invoke<string>('fetch_apec_api', { body: JSON.stringify(body) });

  let data: ApecSearchResponse;
  try {
    data = JSON.parse(text) as ApecSearchResponse;
  } catch (parseErr) {
    console.error('[apec] JSON Parse Error. Snippet:', text.slice(0, 500));
    throw new Error(`APEC JSON Parse Error: ${(parseErr as Error).message}`);
  }

  if (!data.resultats) return [];

  const offers: RawJobOffer[] = data.resultats.map(item => {
    const salary       = parseSalary(item.salaireTexte);
    const contractLabel = item.typeContrat ? CONTRACT_TYPE_MAP[item.typeContrat] ?? null : null;

    // APEC API provides structured data → HIGH confidence
    const hasCoords = item.latitude != null && item.longitude != null;
    const extraction: ExtractionMetadata = {
      titleSource:        'api',
      titleConfidence:    'high',
      locationSource:     hasCoords ? 'api_coords' : (item.lieuTexte ? 'api_text' : 'none'),
      locationConfidence: hasCoords ? 'high' : (item.lieuTexte ? 'high' : 'none'),
      contractSource:     item.typeContrat ? 'api' : 'none',
      contractConfidence: item.typeContrat ? 'high' : 'none',
    };

    return {
      source:             'apec',
      url:                `${APEC_OFFER_BASE}/${item.numeroOffre}`,
      title:              item.intitule,
      company:            item.nomCommercial ?? null,
      location:           item.lieuTexte ?? null,
      locationLat:        item.latitude  ? parseFloat(item.latitude)  : null,
      locationLon:        item.longitude ? parseFloat(item.longitude) : null,
      contractType:       contractLabel,
      descriptionSnippet: item.texteOffre?.slice(0, 500) ?? null,
      publishedAt:        item.datePublication ? new Date(item.datePublication).toISOString() : null,
      salaryMin:          salary.min,
      salaryMax:          salary.max,
      salaryRaw:          salary.raw,
      extraction,
    } satisfies RawJobOffer;
  });

  // Apply local exclusion filter using the profile (APEC supports server-side
  // "ET NON" but we also filter locally as a safety net)
  return offers.filter(o => {
    const text = `${o.title} ${o.company ?? ''} ${o.descriptionSnippet ?? ''}`;
    return !isExcludedByProfile(text, profile);
  });
}
