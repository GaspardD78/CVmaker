/**
 * Parser APEC — API CMS interne (rechercheOffre)
 *
 * L'API POST https://www.apec.fr/cms/webservices/rechercheOffre renvoie du
 * JSON encodé en ISO-8859-1 / Windows-1252 (serveur legacy).
 * tauri-plugin-http échoue avec "invalid utf-8 sequence" lors de la
 * sérialisation IPC. On passe donc par la commande Rust `fetch_apec_api`
 * qui lit les octets bruts et décode proprement avant de retourner la chaîne.
 */

import { invoke } from '@tauri-apps/api/core';
import { RawJobOffer } from '@/types/job-watch';
import type { JobWatchConfig } from '@/types/job-watch';

const APEC_OFFER_BASE = 'https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre';
const PAGE_SIZE = 20;

/** Map APEC numeric typeContrat codes to human-readable labels */
const CONTRACT_TYPE_MAP: Record<number, string> = {
  101888: 'CDI',
  101887: 'CDD',
  101886: 'Intérim',
  101885: 'Stage',
  101884: 'Alternance',
};

/** Extract department code from location string (e.g. "Paris" → "75") */
function locationToDeptCode(location: string): string | null {
  const deptMap: Record<string, string> = {
    'paris': '75',
    'lyon': '69',
    'marseille': '13',
    'toulouse': '31',
    'bordeaux': '33',
    'lille': '59',
    'nantes': '44',
    'strasbourg': '67',
    'montpellier': '34',
    'rennes': '35',
    'nice': '06',
    'grenoble': '38',
  };
  const normalized = location.toLowerCase().trim();
  if (deptMap[normalized]) return deptMap[normalized];
  if (/^\d{2,3}$/.test(normalized)) return normalized;
  return null;
}

interface ApecSearchResult {
  numeroOffre: string;
  intitule: string;
  nomCommercial?: string;
  lieuTexte?: string;
  salaireTexte?: string;
  texteOffre?: string;
  datePublication?: string;
  latitude?: string;
  longitude?: string;
  typeContrat?: number;
}

interface ApecSearchResponse {
  resultats: ApecSearchResult[];
  totalCount: number;
}

/** Build the APEC search request body from config */
function buildSearchBody(config: Pick<JobWatchConfig, 'keywords' | 'excludeKeywords' | 'location'>) {
  const lieux: string[] = [];
  if (config.location) {
    const code = locationToDeptCode(config.location);
    if (code) lieux.push(code);
  }

  let motsCles = config.keywords.join(' ') || undefined;
  if (motsCles && config.excludeKeywords.length > 0) {
    motsCles += ` ET NON (${config.excludeKeywords.join(' OU ')})`;
  }

  return {
    motsCles,
    lieux,
    typesContrat: [],
    niveauxExperience: [],
    typeClient: 'CADRE',
    sorts: [{ type: 'DATE', direction: 'DESCENDING' }],
    pagination: { range: PAGE_SIZE, startIndex: 0 },
    activeFiltre: true,
  };
}

/** Parse salary text like "50 - 55 k€ brut annuel" */
function parseSalary(raw: string | undefined): { min: number | null; max: number | null; raw: string | null } {
  if (!raw) return { min: null, max: null, raw: null };
  const match = raw.match(/(\d+)\s*[-–à]\s*(\d+)\s*k/i);
  if (match) {
    return { min: Number(match[1]) * 1000, max: Number(match[2]) * 1000, raw };
  }
  const single = raw.match(/(\d+)\s*k/i);
  if (single) {
    return { min: Number(single[1]) * 1000, max: null, raw };
  }
  return { min: null, max: null, raw };
}

export async function parseApec(config: JobWatchConfig): Promise<RawJobOffer[]> {
  const body = buildSearchBody(config);
  console.debug('[apec] Search body:', JSON.stringify(body));

  // Passe par la commande Rust pour contourner la limitation UTF-8 de tauri-plugin-http.
  // fetch_apec_api lit les octets bruts et décode ISO-8859-1 si UTF-8 échoue.
  const text = await invoke<string>('fetch_apec_api', { body: JSON.stringify(body) });

  let data: ApecSearchResponse;
  try {
    data = JSON.parse(text) as ApecSearchResponse;
  } catch (parseErr) {
    console.error('[apec] JSON Parse Error. Snippet:', text.slice(0, 500));
    throw new Error(`APEC JSON Parse Error: ${(parseErr as Error).message}`);
  }

  if (!data.resultats) return [];

  return data.resultats.map(item => {
    const salary      = parseSalary(item.salaireTexte);
    const contractLabel = item.typeContrat ? CONTRACT_TYPE_MAP[item.typeContrat] ?? null : null;

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
    } satisfies RawJobOffer;
  });
}
