/**
 * Parser APEC — API CMS interne (rechercheOffre)
 *
 * L'API POST https://www.apec.fr/cms/webservices/rechercheOffre renvoie du
 * JSON encodé en ISO-8859-1 / Windows-1252 (serveur legacy).
 * tauri-plugin-http échoue avec "invalid utf-8 sequence" lors de la
 * sérialisation IPC. On passe donc par la commande Rust `fetch_apec_api`.
 *
 * Notes sur la qualité de la recherche :
 *
 *   1. `motsCles` recherche dans titre + description (la doc APEC ne permet
 *      pas de restreindre au titre seul). Conséquence : un mot comme "recruteur"
 *      matche aussi des offres de comptable où le mot apparaît dans la
 *      description ("rattaché au recruteur de l'équipe", etc.). On compense
 *      avec un filtre post-fetch strict sur le titre, ci-dessous.
 *
 *   2. APEC accepte les opérateurs `ET`, `OU`, `SAUF` (en MAJUSCULES) et les
 *      guillemets pour phrases exactes. `buildApecQuery` les utilise déjà.
 *
 *   3. Le paramètre `lieux` attend des **entiers** (les codes département
 *      en eux-mêmes : 75 = Paris, 92 = Hauts-de-Seine, etc., et 711 =
 *      Île-de-France entière). Une string `"75"` est silencieusement
 *      ignorée — c'était le bug initial qui faisait remonter Lyon/Lille
 *      sur une recherche "Paris". Le mapping vit dans `apec-ids.ts` et
 *      s'enrichit via `tools/apec-id-mapper-extension/`. Pour les
 *      départements non encore tabulés, le post-filter client garde la main.
 *
 *      Le tableau complet des IDs (lieux, fonctions, contrats, niveaux
 *      d'expérience, types de convention) est centralisé dans
 *      `apec-ids.ts`. Pour l'étendre : suivre la procédure dans
 *      `tools/apec-id-mapper-extension/README.md`.
 *
 * Qualité d'extraction : HIGH (titre API) / MEDIUM (lieu API text) / HIGH (contrat code).
 */

import { invoke } from '@tauri-apps/api/core';
import type { RawJobOffer, JobWatchConfig, JobWatchSettings, ExtractionMetadata } from '@/types/job-watch';
import { buildApecQuery, isExcludedByProfile } from '../profile-to-query';
import { APEC_TYPES_CONTRAT_LABEL } from './apec-ids';

const APEC_OFFER_BASE = 'https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre';

/** Pages successives à demander tant qu'il y a des résultats (50 × 3 = 150 max). */
const PAGE_SIZE = 50;
const MAX_PAGES = 3;

/**
 * Mapping minimal des grandes villes françaises vers leur code département.
 * Utilisé en repli quand `departmentCodes` est vide mais `city` est renseigné,
 * pour activer le filtre de localisation post-fetch sans dépendre de l'INSEE.
 */
const CITY_TO_DEPT: Record<string, string> = {
  paris: '75', lyon: '69', marseille: '13', toulouse: '31', nice: '06',
  nantes: '44', strasbourg: '67', montpellier: '34', bordeaux: '33', lille: '59',
  rennes: '35', reims: '51', 'le havre': '76', 'saint-étienne': '42',
  toulon: '83', grenoble: '38', dijon: '21', angers: '49', nîmes: '30',
  'saint-denis': '93', 'le mans': '72', aix: '13', brest: '29',
  tours: '37', amiens: '80', limoges: '87', clermont: '63', besançon: '25',
  metz: '57', orleans: '45', orléans: '45', mulhouse: '68', rouen: '76',
  caen: '14', nancy: '54', avignon: '84', perpignan: '66',
  versailles: '78', creteil: '94', créteil: '94', boulogne: '92',
  nanterre: '92', argenteuil: '95', montreuil: '93',
};

// Le mapping ID → libellé canonique vit dans `apec-ids.ts` ; on importe
// directement la version inversée pour ne pas dupliquer les codes ici.
const CONTRACT_TYPE_MAP: Record<number, string> = APEC_TYPES_CONTRAT_LABEL;

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

/**
 * Construit l'ensemble des codes département attendus pour le filtre lieu.
 * Combine `departmentCodes` explicites + une dérivation heuristique depuis
 * `city` (mapping minimal des grandes villes) — pour ne pas perdre le filtre
 * quand l'utilisateur n'a renseigné que la ville.
 */
function expectedDepartments(profile: { location: { departmentCodes: string[]; city: string } }): Set<string> {
  const set = new Set(profile.location.departmentCodes.map(c => c.trim()).filter(Boolean));
  const city = profile.location.city?.trim().toLowerCase();
  if (city) {
    const dept = CITY_TO_DEPT[city];
    if (dept) set.add(dept);
  }
  return set;
}

/**
 * Vérifie qu'au moins un jobTitle apparaît dans le titre de l'offre, avec
 * frontière de mot (`\b`) pour éviter les sous-chaînes parasites (ex. "comm"
 * matchant "commercial"). Si `jobTitles` est vide on accepte tout — on ne
 * peut pas filtrer ce que l'utilisateur n'a pas spécifié.
 */
function titleMatchesAnyJobTitle(title: string, jobTitles: string[]): boolean {
  const targets = jobTitles.map(t => t.trim()).filter(Boolean);
  if (targets.length === 0) return true;
  for (const t of targets) {
    const re = new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(title)) return true;
  }
  return false;
}

/**
 * Vérifie que le `lieuTexte` APEC pointe sur un département attendu. APEC
 * formate généralement le lieu sous forme "Paris (75)" / "Lyon - 69ème" /
 * "Marseille 13ème arrondissement (13)" — on cherche un code département à
 * 2 chiffres précédé d'une frontière non-numérique.
 */
function lieuMatchesExpectedDepartment(lieuTexte: string | null, expected: Set<string>): boolean {
  if (expected.size === 0) return true; // pas de filtre demandé
  if (!lieuTexte) return false;          // filtre actif → un lieu vide est suspect
  const matches = lieuTexte.match(/(?:^|\D)(\d{2,3})(?:$|\D)/g) ?? [];
  for (const m of matches) {
    const code = m.replace(/\D/g, '');
    // 2 chiffres = département métropole ; 3 chiffres = DOM (971, 972…) ou un arrondissement
    // (75116) que l'on tronque sur les 2 premiers pour retomber sur "75".
    if (expected.has(code)) return true;
    if (code.length === 3 && expected.has(code.slice(0, 2))) return true;
    if (code.length === 5 && expected.has(code.slice(0, 2))) return true;
  }
  return false;
}

export async function parseApec(
  _config: JobWatchConfig,
  settings: JobWatchSettings,
): Promise<RawJobOffer[]> {
  const profile = settings.searchProfile;
  const query   = buildApecQuery(profile);

  // Pré-calcule l'ensemble des départements attendus, utilisé pour le post-filter.
  const expectedDepts = expectedDepartments(profile);

  // `query.lieux` est désormais une liste d'IDs APEC entiers (mapping dans
  // `apec-ids.ts`). Si elle est vide (département absent de la table), on
  // laisse le post-filter client en filet de sécurité — voir plus bas.
  const collected = new Map<string, RawJobOffer>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const body = {
      motsCles:          query.motsCles,
      lieux:             query.lieux,
      typesContrat:      query.typesContrat,
      niveauxExperience: [],
      typeClient:        'CADRE',
      sorts:             [{ type: 'DATE', direction: 'DESCENDING' }],
      pagination:        { range: PAGE_SIZE, startIndex: page * PAGE_SIZE },
      activeFiltre:      true,
    };

    if (page === 0) console.debug('[apec] Search body:', JSON.stringify(body));

    const text = await invoke<string>('fetch_apec_api', { body: JSON.stringify(body) });

    let data: ApecSearchResponse;
    try {
      data = JSON.parse(text) as ApecSearchResponse;
    } catch (parseErr) {
      console.error('[apec] JSON Parse Error. Snippet:', text.slice(0, 500));
      throw new Error(`APEC JSON Parse Error: ${(parseErr as Error).message}`);
    }

    const resultats = data.resultats ?? [];
    if (resultats.length === 0) break;

    for (const item of resultats) {
      if (!item.numeroOffre || !item.intitule) continue;
      if (collected.has(item.numeroOffre)) continue;

      const salary       = parseSalary(item.salaireTexte);
      const contractLabel = item.typeContrat ? CONTRACT_TYPE_MAP[item.typeContrat] ?? null : null;

      const hasCoords = item.latitude != null && item.longitude != null;
      const extraction: ExtractionMetadata = {
        titleSource:        'api',
        titleConfidence:    'high',
        locationSource:     hasCoords ? 'api_coords' : (item.lieuTexte ? 'api_text' : 'none'),
        locationConfidence: hasCoords ? 'high' : (item.lieuTexte ? 'high' : 'none'),
        contractSource:     item.typeContrat ? 'api' : 'none',
        contractConfidence: item.typeContrat ? 'high' : 'none',
      };

      collected.set(item.numeroOffre, {
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
      });
    }

    // Stop early when API stopped feeding results (last page).
    if (resultats.length < PAGE_SIZE) break;
    // Stop if we've reached `totalCount`.
    if (data.totalCount && (page + 1) * PAGE_SIZE >= data.totalCount) break;
  }

  // Post-filter en deux temps : précision titre + précision géo + exclusions.
  // APEC matche `motsCles` sur titre+description, ce qui ramène beaucoup de bruit
  // (ex. "recruteur" ramenant des offres de comptable parce que le mot apparaît
  // dans la description). Le filtre titre supprime ce bruit. Le filtre géo
  // pallie l'absence de filtre `lieux` côté API.
  const jobTitles = profile.jobTitles;
  const filtered: RawJobOffer[] = [];
  let droppedByTitle = 0;
  let droppedByLocation = 0;
  let droppedByExclusion = 0;

  for (const o of collected.values()) {
    if (!titleMatchesAnyJobTitle(o.title, jobTitles)) {
      droppedByTitle++;
      continue;
    }
    if (!lieuMatchesExpectedDepartment(o.location, expectedDepts)) {
      droppedByLocation++;
      continue;
    }
    const text = `${o.title} ${o.company ?? ''} ${o.descriptionSnippet ?? ''}`;
    if (isExcludedByProfile(text, profile)) {
      droppedByExclusion++;
      continue;
    }
    filtered.push(o);
  }

  if (droppedByTitle + droppedByLocation + droppedByExclusion > 0) {
    console.debug(
      `[apec] post-filter : ${filtered.length}/${collected.size} retenues ` +
      `(rejets — titre : ${droppedByTitle}, lieu : ${droppedByLocation}, exclusion : ${droppedByExclusion}).`,
    );
  }

  return filtered;
}
