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
import { cityToDeptCode } from './common/city-departments';

const APEC_OFFER_BASE = 'https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre';

/** Pages successives à demander tant qu'il y a des résultats (50 × 3 = 150 max). */
const PAGE_SIZE = 50;
const MAX_PAGES = 3;

// Le mapping ville → département vit dans `common/city-departments.ts`
// (partagé avec la requête France Travail).

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
  const dept = cityToDeptCode(profile.location.city);
  if (dept) set.add(dept);
  return set;
}

/**
 * Mots vides ignorés lors du découpage d'un intitulé en tokens : ils ne portent
 * pas de sens métier et fausseraient le ratio de recouvrement.
 */
const TITLE_STOPWORDS = new Set([
  'de', 'des', 'du', 'la', 'le', 'les', 'et', 'en', 'un', 'une', 'au', 'aux',
  'of', 'the', 'and', 'for', 'to', 'in',
]);

/**
 * Part minimale des tokens significatifs d'un intitulé qui doivent apparaître
 * dans le titre de l'offre pour conclure à une correspondance. 0.6 ⇒ un intitulé
 * à 1 token exige un match exact, 2 tokens exigent les deux, 3 tokens en
 * tolèrent un manquant (« Talent Acquisition Manager » matche « Talent
 * Acquisition Specialist »). Compromis rappel / précision.
 */
const TITLE_TOKEN_MATCH_RATIO = 0.6;

/** Découpe une chaîne en tokens significatifs : minuscule, sans accents, sans mots vides. */
function significantTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents (diacritiques combinants)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && !TITLE_STOPWORDS.has(t));
}

/**
 * Longueur minimale du radical commun pour considérer deux tokens comme la même
 * famille lexicale. 6 lettres : « recrut » relie recruteur / recrutement /
 * recruteuse, « manage » relie manager / management — tout en restant assez
 * long pour ne pas relier « recrue » (radical commun 5) ou d'autres homographes
 * courts.
 */
const TOKEN_STEM_MIN_PREFIX = 6;

/**
 * Deux tokens matchent s'ils sont égaux ou s'ils partagent un radical d'au
 * moins `TOKEN_STEM_MIN_PREFIX` lettres. Rattrape les dérivations françaises
 * courantes (recruteur ↔ recrutement) sans dépendre d'un stemmer complet.
 */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < TOKEN_STEM_MIN_PREFIX || b.length < TOKEN_STEM_MIN_PREFIX) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.startsWith(short.slice(0, Math.max(TOKEN_STEM_MIN_PREFIX, short.length - 3)));
}

/**
 * Vérifie qu'au moins un jobTitle « recouvre » le titre de l'offre. La comparaison
 * se fait par tokens (et non plus par sous-chaîne exacte) : un intitulé matche si
 * au moins `TITLE_TOKEN_MATCH_RATIO` de ses tokens significatifs sont présents
 * dans le titre, indépendamment de l'ordre et des accents. Les tokens sont
 * comparés par famille lexicale (cf. `tokensMatch`) : « Recruteur » retrouve
 * « Chargé de recrutement » — l'égalité stricte rejetait 100 % des résultats
 * APEC dès que l'offre déclinait le métier autrement. Le seuil de recouvrement
 * écarte toujours le bruit (« Chargé de clientèle » ne matche pas « Chargé de
 * recrutement » : 1 token sur 2).
 *
 * Si `jobTitles` est vide — ou ne contient aucun token exploitable — on accepte
 * tout : on ne peut pas filtrer sur ce que l'utilisateur n'a pas spécifié.
 */
export function titleMatchesAnyJobTitle(title: string, jobTitles: string[]): boolean {
  const offerTokens = significantTokens(title);
  let anyTargetHadTokens = false;
  for (const raw of jobTitles) {
    const wanted = significantTokens(raw);
    if (wanted.length === 0) continue;
    anyTargetHadTokens = true;
    const present = wanted.filter(w => offerTokens.some(t => tokensMatch(w, t))).length;
    if (present / wanted.length >= TITLE_TOKEN_MATCH_RATIO) return true;
  }
  return !anyTargetHadTokens;
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

  const runSearch = async (withOptionalFilters: boolean): Promise<void> => {
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = {
      // Toujours envoyer une chaîne : `undefined` serait omis par
      // `JSON.stringify`, et le backend APEC peut renvoyer un 500 sur un champ
      // `motsCles` absent. Le site officiel envoie `""` quand aucun mot-clé.
      motsCles:          query.motsCles ?? '',
      lieux:             query.lieux,
      // Filtres « optionnels » (fonctions/secteurs/télétravail) : filtres
      // serveur exacts qui, combinés, peuvent intersecter à zéro alors que
      // des offres pertinentes existent (tags absents côté APEC). Le repli
      // sans ces filtres est déclenché plus bas quand la 1ʳᵉ passe rend 0.
      fonctions:         withOptionalFilters ? query.fonctions   : [],
      secteursActivite:  withOptionalFilters ? query.secteurs    : [],
      typesTeletravail:  withOptionalFilters ? query.teletravail : [],
      // Pas de champ `salaires` : le DTO APEC (RechercheOffreCriteriaDto) ne
      // l'expose pas (il connaît seulement `salaireMinimum`/`salaireMaximum`).
      // L'envoyer — même vide — déclenchait un 500 « Unrecognized field
      // "salaires" » qui cassait TOUTES les recherches APEC. Le filtrage par
      // salaire reste assuré côté scorer via `profile.salary` (cf. scorer.ts).
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
  };

  const hasOptionalFilters =
    query.fonctions.length > 0 || query.secteurs.length > 0 || query.teletravail.length > 0;

  await runSearch(true);
  if (collected.size === 0 && hasOptionalFilters) {
    // 0 résultat avec les filtres serveur exacts : beaucoup d'offres APEC ne
    // portent pas les tags secteur/télétravail et sont exclues à tort. On
    // relance sans ces filtres — les post-filtres client (titre, lieu,
    // exclusions) et le scorer maintiennent la précision.
    console.warn(
      '[apec] 0 résultat avec les filtres fonctions/secteurs/télétravail — ' +
      'nouvelle tentative sans ces filtres (post-filtrage client conservé).',
    );
    await runSearch(false);
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
