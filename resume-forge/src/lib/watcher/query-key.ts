/**
 * Empreinte de requête — ce qui permet à plusieurs pistes de partager une
 * seule requête réseau.
 *
 * Deux pistes du portefeuille interrogent souvent la même chose tout en notant
 * différemment : même métier et même ville, mais des compétences, des
 * exclusions ou un salaire cible distincts. Sans mutualisation, passer de 1 à 4
 * pistes multiplierait par 4 les appels aux sources scrapées et déclencherait
 * leurs protections anti-bot.
 *
 * L'empreinte ne retient donc QUE ce qui part réellement dans la requête :
 * mots-clés, localisation, rayon, types de contrat, filtres serveur. Tout ce
 * qui ne sert qu'au scoring local — compétences, domaines, exclusions,
 * salaire, blacklist, mode de scoring — en est délibérément exclu.
 */

import type { JobSource, SearchProfile } from '@/types/job-watch';

/** Normalise une liste : trim, minuscules, sans vides, dédupliquée, triée. */
function norm(values: string[] | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = value.trim().toLowerCase();
    if (cleaned) seen.add(cleaned);
  }
  return [...seen].sort();
}

/** Sérialisation stable : les clés sont ordonnées, l'ordre d'écriture n'influe pas. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * Paramètres de requête effectifs d'une source, extraits du profil.
 *
 * Une source absente de cette table retombe sur une forme générique
 * (mots-clés + localisation + contrats) : conservatrice, elle peut manquer une
 * mutualisation mais n'en produira jamais une abusive.
 */
export function queryShape(source: JobSource, profile: SearchProfile): Record<string, unknown> {
  const titles = norm(profile.jobTitles);
  const city = profile.location.city.trim().toLowerCase();
  const radius = profile.location.radiusKm;
  const contracts = norm(profile.contractTypes);

  switch (source) {
    case 'apec':
      return {
        titles,
        departments: norm(profile.location.departmentCodes),
        radius,
        contracts,
        fonctions:   norm(profile.apecFonctions),
        secteurs:    norm(profile.apecSecteurs),
        teletravail: norm(profile.apecTeletravail),
        salaires:    norm(profile.apecSalaires),
      };

    case 'france_travail':
      return { titles, insee: profile.location.inseeCode.trim(), radius, contracts };

    case 'wttj':
      // Le parser n'interroge que les premiers intitulés (une requête Algolia
      // chacun) : au-delà, deux profils produisent la même requête.
      return { titles: titles.slice(0, 3), city };

    case 'linkedin':
    case 'linkedin_rss':
      return { titles, city };

    case 'indeed':
      return { titles, fallbackSkill: norm(profile.skills)[0] ?? '', city };

    case 'hellowork':
      return { titles: titles.slice(0, 2), city };

    case 'jobicy':
      return { titles };

    case 'emploi_territorial':
      return { titles, city, departments: norm(profile.location.departmentCodes) };

    default:
      return { titles, city, radius, contracts };
  }
}

/**
 * Empreinte d'une requête. Deux tâches de collecte partageant cette empreinte
 * émettent une seule requête réseau, dont le résultat est évalué par chacune
 * des pistes concernées.
 *
 * `rssUrl` en fait partie : une URL personnalisée change la requête, même à
 * profil identique.
 */
export function computeQueryKey(
  source: JobSource,
  profile: SearchProfile,
  rssUrl?: string | null,
): string {
  return `${source}|${rssUrl ?? ''}|${stableStringify(queryShape(source, profile))}`;
}
