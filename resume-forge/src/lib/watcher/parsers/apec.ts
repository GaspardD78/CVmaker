/**
 * Parser APEC — API CMS interne (rechercheOffre)
 *
 * Le flux RSS APEC n'est plus disponible (HTTP 500 systématique).
 * On utilise l'API publique du site web APEC :
 *   POST https://www.apec.fr/cms/webservices/rechercheOffre
 *
 * Pas d'authentification requise, pas de clé API.
 * Pagination via { pagination: { startIndex, range } }.
 */

import { RawJobOffer } from '@/types/job-watch';
import type { JobWatchConfig } from '@/types/job-watch';
import { tauriFetch, BROWSER_USER_AGENT } from '../http';

const APEC_SEARCH_URL = 'https://www.apec.fr/cms/webservices/rechercheOffre';
const APEC_OFFER_BASE = 'https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre';
const PAGE_SIZE = 20;
const TIMEOUT_MS = 15_000;

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
  // Common French department name → code mappings
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
  // Direct match
  if (deptMap[normalized]) return deptMap[normalized];
  // If already a numeric dept code (e.g. "75" or "69")
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

  // APEC supports "ET NON (term1 OU term2)" syntax for exclusions
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let data: ApecSearchResponse;
  try {
    // Convertir explicitement en tableau numérique pour que Tauri IPC (Rust)
    // ne plante pas sur la sérialisation UTF-8 des chaînes avec accents.
    const reqBodyBytes = Array.from(new TextEncoder().encode(JSON.stringify(body)));

    const res = await tauriFetch(APEC_SEARCH_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json',
        'Referer': 'https://www.apec.fr/candidat/recherche-emploi.html/emploi',
        'Origin': 'https://www.apec.fr',
      },
      body: new Uint8Array(reqBodyBytes), // Repasser en Uint8Array pour le tauriFetch
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`APEC API HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const buffer = await res.arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    data = JSON.parse(text) as ApecSearchResponse;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!data.resultats) return [];

  return data.resultats.map(item => {
    const salary = parseSalary(item.salaireTexte);
    const contractLabel = item.typeContrat ? CONTRACT_TYPE_MAP[item.typeContrat] ?? null : null;

    return {
      source:             'apec',
      url:                `${APEC_OFFER_BASE}/${item.numeroOffre}`,
      title:              item.intitule,
      company:            item.nomCommercial ?? null,
      location:           item.lieuTexte ?? null,
      locationLat:        item.latitude ? parseFloat(item.latitude) : null,
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
