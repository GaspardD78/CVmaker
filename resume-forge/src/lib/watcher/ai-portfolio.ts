/**
 * Couche IA du portefeuille — prompt stratège et revue de portefeuille.
 *
 * Principe inchangé et non négociable : aucun appel réseau vers un LLM.
 * L'application assemble un prompt, l'utilisateur le colle dans l'assistant de
 * son choix, puis recolle le JSON obtenu. Tout est validé et appliqué
 * localement.
 *
 * Le risque, quand on demande à un assistant « propose-moi quatre recherches
 * d'emploi », est qu'il produise quatre reformulations du même poste. Le
 * prompt est donc construit autour de contraintes de non-recouvrement
 * explicites et d'une typologie imposée, et la validation signale les
 * recouvrements résiduels avant que l'utilisateur n'applique.
 */

import {
  ALERT_KINDS,
  ALERT_KIND_COLORS,
  ALERT_KIND_LABELS,
  DEFAULT_SEARCH_PROFILE,
  MAX_ALERTS,
  type AlertKind,
  type JobSource,
  type JobWatchAlert,
  type SearchProfile,
} from '@/types/job-watch';
import { validateAIFilterRule, type AIFilterRule } from './ai-filter';
import type { PortfolioMetrics } from './portfolio-metrics';

export const AI_PORTFOLIO_SCHEMA_VERSION = '1.0';
export const AI_REVIEW_SCHEMA_VERSION = '1.0';

/** Sources proposables à l'IA, avec la note d'usage qui guide son choix. */
const SOURCE_GUIDE: Array<{ id: JobSource; note: string }> = [
  { id: 'apec',               note: 'cadres, France. Filtres serveur par fonction très efficaces.' },
  { id: 'france_travail',     note: 'généraliste, très gros volume, tous niveaux.' },
  { id: 'wttj',               note: 'tech, startups, scale-ups. Peu pertinent hors de ces milieux.' },
  { id: 'linkedin',           note: 'généraliste, cadres et tech. Volume moyen, source fragile.' },
  { id: 'indeed',             note: 'généraliste, gros volume, qualité inégale.' },
  { id: 'hellowork',          note: 'généraliste France, bon sur les profils non-cadres.' },
  { id: 'jobicy',             note: 'remote international, anglophone. Uniquement pour du remote.' },
  { id: 'emploi_territorial', note: 'fonction publique territoriale UNIQUEMENT. Le site refuse les requêtes automatiques : ne pas proposer.' },
];

const ALLOWED_SOURCES = new Set<string>(SOURCE_GUIDE.map(s => s.id));

// ── Schéma du portefeuille généré ────────────────────────────────────────────

export interface PortfolioSearchProfile {
  jobTitles: string[];
  skills: string[];
  domains: string[];
  excludeTitles: string[];
  excludeDomains: string[];
  location: {
    label: string;
    city: string;
    inseeCode?: string;
    departmentCodes?: string[];
    radiusKm: number;
  };
  contractTypes: string[];
  salary: { min: number | null; target: number | null };
  scoring: { mode: 'strict' | 'balanced' | 'loose' };
  blacklistedCompanies?: string[];
}

export interface PortfolioAlert {
  name: string;
  kind: AlertKind;
  /** Pourquoi cette piste existe et ce qu'elle capte que les autres ne captent pas. */
  rationale: string;
  searchProfile: PortfolioSearchProfile;
  sources: JobSource[];
  aiFilter?: AIFilterRule;
}

export interface AlertPortfolio {
  version: string;
  rationale: string;
  alerts: PortfolioAlert[];
  blindSpots?: string[];
}

export interface PortfolioValidationResult {
  portfolio: AlertPortfolio;
  /** Problèmes de qualité — n'empêchent pas l'import, sont affichés dans l'aperçu. */
  warnings: string[];
}

// ── Validation ───────────────────────────────────────────────────────────────

function fail(message: string): never {
  throw new Error(message);
}

function asStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) {
    fail(`Champ « ${field} » : un tableau de chaînes est attendu.`);
  }
  return (value as string[]).map(v => v.trim()).filter(Boolean);
}

function asNumberOrNull(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`Champ « ${field} » : un nombre ou null est attendu.`);
  }
  return value;
}

function validateProfile(raw: unknown, alertName: string): PortfolioSearchProfile {
  if (!raw || typeof raw !== 'object') fail(`Piste « ${alertName} » : « searchProfile » manquant.`);
  const p = raw as Record<string, unknown>;

  const jobTitles = asStringArray(p.jobTitles, `${alertName}.jobTitles`);
  if (jobTitles.length < 2) {
    fail(`Piste « ${alertName} » : au moins 2 intitulés de poste sont attendus (reçu ${jobTitles.length}).`);
  }
  const excludeTitles = asStringArray(p.excludeTitles, `${alertName}.excludeTitles`);
  if (excludeTitles.length < 3) {
    fail(`Piste « ${alertName} » : au moins 3 exclusions sont attendues (reçu ${excludeTitles.length}).`);
  }

  const location = (p.location ?? {}) as Record<string, unknown>;
  const radiusKm = typeof location.radiusKm === 'number' && Number.isFinite(location.radiusKm)
    ? location.radiusKm
    : DEFAULT_SEARCH_PROFILE.location.radiusKm;

  const scoring = (p.scoring ?? {}) as Record<string, unknown>;
  const mode = scoring.mode ?? 'balanced';
  if (mode !== 'strict' && mode !== 'balanced' && mode !== 'loose') {
    fail(`Piste « ${alertName} » : mode de scoring inconnu « ${String(mode)} ».`);
  }

  const salary = (p.salary ?? {}) as Record<string, unknown>;

  return {
    jobTitles,
    skills:         asStringArray(p.skills, `${alertName}.skills`),
    domains:        asStringArray(p.domains, `${alertName}.domains`),
    excludeTitles,
    excludeDomains: asStringArray(p.excludeDomains, `${alertName}.excludeDomains`),
    location: {
      label:           typeof location.label === 'string' ? location.label : '',
      city:            typeof location.city === 'string' ? location.city : '',
      inseeCode:       typeof location.inseeCode === 'string' ? location.inseeCode : '',
      departmentCodes: asStringArray(location.departmentCodes, `${alertName}.location.departmentCodes`),
      radiusKm,
    },
    contractTypes: asStringArray(p.contractTypes, `${alertName}.contractTypes`),
    salary: {
      min:    asNumberOrNull(salary.min, `${alertName}.salary.min`),
      target: asNumberOrNull(salary.target, `${alertName}.salary.target`),
    },
    scoring: { mode },
    blacklistedCompanies: asStringArray(p.blacklistedCompanies, `${alertName}.blacklistedCompanies`),
  };
}

/**
 * Valide un portefeuille collé par l'utilisateur.
 *
 * Les erreurs de forme sont des rejets — appliquer un portefeuille incohérent
 * abîmerait la configuration. Les problèmes de qualité (recouvrement, piste
 * sans source, angles morts non renseignés) sont des avertissements : c'est un
 * jugement, et l'utilisateur reste décideur.
 */
export function validateAlertPortfolio(input: unknown): PortfolioValidationResult {
  if (!input || typeof input !== 'object') fail('Réponse illisible : un objet JSON est attendu.');
  const root = input as Record<string, unknown>;

  if (root.version !== AI_PORTFOLIO_SCHEMA_VERSION) {
    fail(`Version de schéma inconnue (« ${String(root.version)} »). Attendu : « ${AI_PORTFOLIO_SCHEMA_VERSION} ».`);
  }
  if (!Array.isArray(root.alerts)) fail('Champ « alerts » : un tableau de pistes est attendu.');

  const rawAlerts = root.alerts as unknown[];
  if (rawAlerts.length < 3) {
    fail(`Un portefeuille compte au moins 3 pistes (reçu ${rawAlerts.length}).`);
  }
  if (rawAlerts.length > MAX_ALERTS) {
    fail(`Un portefeuille compte au plus ${MAX_ALERTS} pistes (reçu ${rawAlerts.length}).`);
  }

  const warnings: string[] = [];
  const alerts: PortfolioAlert[] = rawAlerts.map((raw, index) => {
    if (!raw || typeof raw !== 'object') fail(`Piste n°${index + 1} illisible.`);
    const a = raw as Record<string, unknown>;

    const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : fail(`Piste n°${index + 1} : « name » manquant.`);
    const kind = a.kind as AlertKind;
    if (!ALERT_KINDS.includes(kind)) {
      fail(`Piste « ${name} » : type inconnu « ${String(a.kind)} ». Attendu : ${ALERT_KINDS.join(', ')}.`);
    }

    const sources = asStringArray(a.sources, `${name}.sources`);
    for (const source of sources) {
      if (!ALLOWED_SOURCES.has(source)) {
        fail(`Piste « ${name} » : source inconnue « ${source} ».`);
      }
    }
    if (sources.length === 0) {
      warnings.push(`La piste « ${name} » n'a aucune source : elle ne collectera rien.`);
    }

    let aiFilter: AIFilterRule | undefined;
    if (a.aiFilter !== undefined && a.aiFilter !== null) {
      try {
        aiFilter = validateAIFilterRule(a.aiFilter);
      } catch (err) {
        fail(`Piste « ${name} » : filtre IA invalide — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      name,
      kind,
      rationale: typeof a.rationale === 'string' ? a.rationale.trim() : '',
      searchProfile: validateProfile(a.searchProfile, name),
      sources: sources as JobSource[],
      aiFilter,
    };
  });

  const coreCount = alerts.filter(a => a.kind === 'core').length;
  if (coreCount !== 1) {
    fail(`Un portefeuille comporte exactement une piste « cœur de cible » (reçu ${coreCount}).`);
  }
  if (!alerts.some(a => a.kind === 'exploratory')) {
    fail("Un portefeuille comporte au moins une piste d'ouverture (« exploratory »).");
  }

  // Recouvrement des intitulés : c'est un jugement de qualité, pas une erreur
  // de format. On le signale, l'utilisateur décide.
  for (let i = 0; i < alerts.length; i++) {
    for (let j = i + 1; j < alerts.length; j++) {
      const a = new Set(alerts[i].searchProfile.jobTitles.map(t => t.toLowerCase()));
      const shared = alerts[j].searchProfile.jobTitles.filter(t => a.has(t.toLowerCase()));
      if (shared.length > 1) {
        warnings.push(
          `Les pistes « ${alerts[i].name} » et « ${alerts[j].name} » partagent ${shared.length} intitulés (${shared.join(', ')}) : elles risquent de ramener les mêmes offres.`,
        );
      }
    }
  }

  const blindSpots = asStringArray(root.blindSpots, 'blindSpots');
  if (blindSpots.length === 0) {
    warnings.push("L'assistant n'a signalé aucun angle mort : le portefeuille n'est probablement pas aussi complet qu'il en a l'air.");
  }

  return {
    portfolio: {
      version: AI_PORTFOLIO_SCHEMA_VERSION,
      rationale: typeof root.rationale === 'string' ? root.rationale.trim() : '',
      alerts,
      blindSpots,
    },
    warnings,
  };
}

/**
 * Extrait le JSON d'une réponse potentiellement bavarde (bloc Markdown,
 * phrase d'introduction…). Les assistants encadrent souvent leur sortie.
 */
export function extractJson(raw: string): unknown {
  let text = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) text = fenced[1].trim();
  return JSON.parse(text);
}

// ── Aperçu et application de l'import ────────────────────────────────────────

export interface PortfolioImportPreview {
  creations: PortfolioAlert[];
  replacements: Array<{ existingAlertId: string; existingName: string; incoming: PortfolioAlert }>;
  warnings: string[];
}

/**
 * Confronte le portefeuille proposé à celui qui existe déjà.
 *
 * Une piste de même nom est remplacée plutôt que dupliquée : relancer le
 * prompt stratège doit affiner le portefeuille, pas le faire enfler jusqu'à
 * buter sur la limite.
 */
export function buildPortfolioImportPreview(
  portfolio: AlertPortfolio,
  existing: Array<{ id: string; name: string }>,
  warnings: string[] = [],
): PortfolioImportPreview {
  const byName = new Map(existing.map(a => [a.name.trim().toLowerCase(), a]));
  const creations: PortfolioAlert[] = [];
  const replacements: PortfolioImportPreview['replacements'] = [];

  for (const incoming of portfolio.alerts) {
    const match = byName.get(incoming.name.trim().toLowerCase());
    if (match) replacements.push({ existingAlertId: match.id, existingName: match.name, incoming });
    else creations.push(incoming);
  }

  const finalCount = existing.length - replacements.length + creations.length;
  const allWarnings = [...warnings];
  if (finalCount > MAX_ALERTS) {
    allWarnings.push(
      `Le portefeuille compterait ${finalCount} pistes, au-delà de la limite de ${MAX_ALERTS}. Supprimez d'abord une piste existante.`,
    );
  }

  return { creations, replacements, warnings: allWarnings };
}

/** Traduit une piste proposée en profil de recherche complet. */
export function toSearchProfile(alert: PortfolioAlert): SearchProfile {
  return {
    ...DEFAULT_SEARCH_PROFILE,
    name:           alert.name,
    jobTitles:      alert.searchProfile.jobTitles,
    skills:         alert.searchProfile.skills,
    domains:        alert.searchProfile.domains,
    excludeTitles:  alert.searchProfile.excludeTitles,
    excludeDomains: alert.searchProfile.excludeDomains,
    location: {
      label:           alert.searchProfile.location.label,
      city:            alert.searchProfile.location.city,
      inseeCode:       alert.searchProfile.location.inseeCode ?? '',
      departmentCodes: alert.searchProfile.location.departmentCodes ?? [],
      radiusKm:        alert.searchProfile.location.radiusKm,
    },
    contractTypes:        alert.searchProfile.contractTypes,
    salary:               alert.searchProfile.salary,
    scoring:              alert.searchProfile.scoring,
    blacklistedCompanies: alert.searchProfile.blacklistedCompanies ?? [],
  };
}

// ── Prompts ──────────────────────────────────────────────────────────────────

export interface StrategyPromptInput {
  profileTitle: string | null;
  skills: string[];
  experiences: Array<{ title: string; company: string | null }>;
  education: string[];
  intent: string;
  constraints: {
    locationLabel: string;
    radiusKm: number;
    mobility: string;
    contractTypes: string[];
    salaryMin: number | null;
    salaryTarget: number | null;
  };
  currentPortfolio: Array<Pick<JobWatchAlert, 'name' | 'kind'> & { jobTitles: string[] }>;
}

function list(values: string[], fallback = 'non renseigné'): string {
  const cleaned = values.map(v => v.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(', ') : fallback;
}

export function buildPortfolioStrategyPrompt(input: StrategyPromptInput): string {
  const experiences = input.experiences.length > 0
    ? input.experiences.map(e => `- ${e.title}${e.company ? ` — ${e.company}` : ''}`).join('\n')
    : '- non renseignées';

  const current = input.currentPortfolio.length > 0
    ? input.currentPortfolio
        .map(a => `- ${a.name} (${ALERT_KIND_LABELS[a.kind]}) : ${list(a.jobTitles, 'aucun intitulé')}`)
        .join('\n')
    : 'Aucun — portefeuille à créer de zéro.';

  const sources = SOURCE_GUIDE.map(s => `- "${s.id}" — ${s.note}`).join('\n');

  return `Agis comme un stratège en recherche d'emploi. Ta mission n'est pas de trouver un poste,
mais de concevoir un PORTEFEUILLE DE PISTES complémentaires à surveiller en parallèle.

# PROFIL DU CANDIDAT
- Titre actuel : ${input.profileTitle ?? 'non renseigné'}
- Compétences : ${list(input.skills)}
- Expériences :
${experiences}
- Formations : ${list(input.education)}

# INTENTION EXPRIMÉE
${input.intent.trim() || 'Non exprimée — déduis-la du profil.'}

# CONTRAINTES
- Localisation de référence : ${input.constraints.locationLabel || 'non renseignée'} (rayon acceptable : ${input.constraints.radiusKm} km)
- Mobilité déclarée : ${input.constraints.mobility || 'non précisée'}
- Types de contrat acceptés : ${list(input.constraints.contractTypes)}
- Salaire plancher : ${input.constraints.salaryMin ?? 'non précisé'} — cible : ${input.constraints.salaryTarget ?? 'non précisée'}

# PORTEFEUILLE ACTUEL
${current}

# CE QU'EST UN BON PORTEFEUILLE
3 à ${MAX_ALERTS} pistes, chacune d'un type distinct :
- "core" (obligatoire, exactement une) : le poste le plus légitime au regard du profil.
  C'est la piste à plus fort taux de conversion.
- "adjacent" (1 ou 2) : mêmes compétences, intitulé ou métier voisin. Elle capte ce que
  la piste cœur rate à cause du vocabulaire des recruteurs.
- "exploratory" (obligatoire, au moins une) : une ouverture assumée — autre secteur,
  autre géographie, autre format de contrat, ou repositionnement. Elle doit être
  plausible au vu du profil, pas fantaisiste.
- "opportunistic" (facultative) : un angle étroit à forte valeur — une technologie rare,
  un type de structure, une taille d'entreprise, un contexte particulier.

# RÈGLES IMPÉRATIVES
1. Entre 3 et ${MAX_ALERTS} pistes. Jamais plus.
2. Deux pistes ne partagent pas plus d'UN terme dans leurs \`jobTitles\`. Si tu ne peux
   pas respecter cette règle, c'est que la piste est redondante : supprime-la.
3. Chaque piste a au moins 2 \`jobTitles\` et au moins 3 \`excludeTitles\`.
4. Les \`excludeTitles\` doivent être spécifiques : "développeur junior" et non "junior".
5. Les \`sources\` sont choisies EXCLUSIVEMENT dans la liste fournie ci-dessous, et
   doivent être cohérentes avec la piste (voir les notes d'usage).
6. \`rationale\` explique en une à deux phrases POURQUOI cette piste existe et ce qu'elle
   capte que les autres ne captent pas.
7. \`blindSpots\` liste honnêtement ce que ce portefeuille NE couvre PAS et pourquoi tu
   as écarté ces angles. Ne le laisse pas vide par complaisance.
8. Réponds UNIQUEMENT par le JSON, sans texte avant ni après.

# SOURCES DISPONIBLES
${sources}

# SCHÉMA DE SORTIE
\`\`\`typescript
interface AlertPortfolio {
  version: "${AI_PORTFOLIO_SCHEMA_VERSION}";
  rationale: string;                     // logique d'ensemble, 3 à 6 lignes
  alerts: Array<{
    name: string;                        // nom court et parlant, ex: "Recrutement tech remote"
    kind: "core" | "adjacent" | "exploratory" | "opportunistic";
    rationale: string;
    searchProfile: {
      jobTitles: string[];               // >= 2
      skills: string[];
      domains: string[];
      excludeTitles: string[];           // >= 3
      excludeDomains: string[];
      location: {
        label: string;                   // ex: "Paris (75)"
        city: string;                    // ex: "Paris"
        inseeCode?: string;              // laisse vide si tu ne le connais pas
        departmentCodes?: string[];      // ex: ["75","92"]
        radiusKm: number;
      };
      contractTypes: string[];           // ex: ["CDI"]
      salary: { min: number | null; target: number | null };
      scoring: { mode: "strict" | "balanced" | "loose" };
      blacklistedCompanies?: string[];
    };
    sources: string[];                   // identifiants de la liste ci-dessus
  }>;
  blindSpots?: string[];
}
\`\`\`

# EXEMPLE ABRÉGÉ
Profil : Responsable recrutement, 8 ans, Paris, ATS et sourcing.
Portefeuille pertinent :
- core          : "Talent Acquisition" (apec, linkedin, france_travail)
- adjacent      : "RRH et développement RH" (apec, france_travail)
- exploratory   : "Recrutement tech en remote" (wttj, jobicy, linkedin)
- opportunistic : "RH en scale-up en hypercroissance" (wttj, linkedin)
Recouvrement volontairement faible : le vocabulaire, le secteur et la géographie
diffèrent d'une piste à l'autre.

Maintenant, produis le JSON du portefeuille.`;
}

// ── Revue de portefeuille ────────────────────────────────────────────────────

export type AlertVerdict = 'keep' | 'tune' | 'merge' | 'drop';

export interface PortfolioReview {
  version: string;
  overlaps: Array<{ alertA: string; alertB: string; sharedPercent: number; recommendation: string }>;
  perAlert: Array<{
    alertName: string;
    verdict: AlertVerdict;
    why: string;
    suggestedChanges?: {
      addJobTitles?: string[];
      removeJobTitles?: string[];
      addExcludeTitles?: string[];
      removeExcludeTitles?: string[];
      addSources?: JobSource[];
      removeSources?: JobSource[];
      scoringMode?: 'strict' | 'balanced' | 'loose';
    };
  }>;
  blindSpots: Array<{ label: string; why: string }>;
}

export function buildPortfolioReviewPrompt(
  alerts: Array<Pick<JobWatchAlert, 'name' | 'kind' | 'searchProfile' | 'sources'>>,
  metrics: PortfolioMetrics,
): string {
  const definitions = alerts.map(a => `
## ${a.name} (${ALERT_KIND_LABELS[a.kind]})
- Titres visés : ${list(a.searchProfile.jobTitles, 'aucun')}
- Exclusions : ${list(a.searchProfile.excludeTitles, 'aucune')}
- Compétences : ${list(a.searchProfile.skills, 'aucune')} | Secteurs : ${list(a.searchProfile.domains, 'aucun')}
- Localisation : ${a.searchProfile.location.label || 'non renseignée'} (${a.searchProfile.location.radiusKm} km) | Contrats : ${list(a.searchProfile.contractTypes, 'tous')}
- Sources : ${list(a.sources, 'aucune')}`).join('\n');

  const perAlert = metrics.perAlert.map(m =>
    `- ${m.name} : ${m.total} offres (${m.exclusive} exclusives) | lues ${m.readRate} % | importées Kanban ${m.kanbanRate} % | archivées sans lecture ${m.quickArchiveRate} % | score médian ${m.medianScore}`
  ).join('\n');

  const overlaps = metrics.overlaps.length > 0
    ? metrics.overlaps.map(o => `- ${o.nameA} ↔ ${o.nameB} : ${o.sharedPercent} % d'offres communes (${o.shared} offres)`).join('\n')
    : '- aucun recouvrement mesurable';

  return `Agis comme un analyste de stratégie de recherche d'emploi. Tu évalues la SANTÉ D'UN
PORTEFEUILLE de pistes de veille, pas la qualité d'offres individuelles.

# PORTEFEUILLE ACTUEL
${definitions}

# MÉTRIQUES SUR ${metrics.windowDays} JOURS
${perAlert}

# RECOUVREMENT ENTRE PISTES
${overlaps}

# CE QUE TU DOIS PRODUIRE
1. \`overlaps\` : pour chaque paire dont le recouvrement dépasse 40 %, dis laquelle des
   deux pistes est redondante et ce qu'il faut modifier pour les différencier.
2. \`perAlert\` : un verdict par piste — "keep", "tune", "merge" ou "drop" — avec sa
   justification et, si applicable, les changements concrets suggérés.
3. \`blindSpots\` : les angles que ce portefeuille ne couvre pas et qui seraient
   plausibles au vu des pistes existantes. Sois concret et justifie chaque angle.

# GRILLE DE LECTURE
- Volume élevé + taux d'import Kanban nul = la piste produit du bruit, pas des
  opportunités. Elle doit être resserrée, pas élargie.
- Volume faible + taux d'import élevé = piste précise et efficace. Ne la dilue pas ;
  envisage plutôt d'élargir ses sources.
- Taux d'archivage sans lecture élevé = le titre des offres ne correspond pas à
  l'intention. Le problème est dans les jobTitles, pas dans le scoring.
- Peu d'offres exclusives = la piste n'apporte rien que les autres n'apportent déjà.
- Une piste d'ouverture a le droit d'avoir un taux de conversion faible : c'est sa
  fonction. Ne recommande jamais de la supprimer sur ce seul critère.

Réponds UNIQUEMENT par le JSON conforme au schéma ci-dessous.

# SCHÉMA DE SORTIE
\`\`\`typescript
interface PortfolioReview {
  version: "${AI_REVIEW_SCHEMA_VERSION}";
  overlaps: Array<{ alertA: string; alertB: string; sharedPercent: number; recommendation: string }>;
  perAlert: Array<{
    alertName: string;
    verdict: "keep" | "tune" | "merge" | "drop";
    why: string;
    suggestedChanges?: {
      addJobTitles?: string[];
      removeJobTitles?: string[];
      addExcludeTitles?: string[];
      removeExcludeTitles?: string[];
      addSources?: string[];
      removeSources?: string[];
      scoringMode?: "strict" | "balanced" | "loose";
    };
  }>;
  blindSpots: Array<{ label: string; why: string }>;
}
\`\`\``;
}

const VERDICTS: AlertVerdict[] = ['keep', 'tune', 'merge', 'drop'];

function isScoringMode(value: unknown): value is 'strict' | 'balanced' | 'loose' {
  return value === 'strict' || value === 'balanced' || value === 'loose';
}

export function validatePortfolioReview(input: unknown): PortfolioReview {
  if (!input || typeof input !== 'object') fail('Réponse illisible : un objet JSON est attendu.');
  const root = input as Record<string, unknown>;

  if (root.version !== AI_REVIEW_SCHEMA_VERSION) {
    fail(`Version de schéma inconnue (« ${String(root.version)} »). Attendu : « ${AI_REVIEW_SCHEMA_VERSION} ».`);
  }
  if (!Array.isArray(root.perAlert)) fail('Champ « perAlert » : un tableau est attendu.');

  const perAlert = (root.perAlert as unknown[]).map((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const alertName = typeof item.alertName === 'string' ? item.alertName : fail(`Verdict n°${index + 1} : « alertName » manquant.`);
    const verdict = item.verdict as AlertVerdict;
    if (!VERDICTS.includes(verdict)) {
      fail(`Piste « ${alertName} » : verdict inconnu « ${String(item.verdict)} ».`);
    }
    const changes = (item.suggestedChanges ?? undefined) as Record<string, unknown> | undefined;
    return {
      alertName,
      verdict,
      why: typeof item.why === 'string' ? item.why : '',
      suggestedChanges: changes
        ? {
            addJobTitles:        asStringArray(changes.addJobTitles, 'addJobTitles'),
            removeJobTitles:     asStringArray(changes.removeJobTitles, 'removeJobTitles'),
            addExcludeTitles:    asStringArray(changes.addExcludeTitles, 'addExcludeTitles'),
            removeExcludeTitles: asStringArray(changes.removeExcludeTitles, 'removeExcludeTitles'),
            addSources:          asStringArray(changes.addSources, 'addSources').filter(s => ALLOWED_SOURCES.has(s)) as JobSource[],
            removeSources:       asStringArray(changes.removeSources, 'removeSources').filter(s => ALLOWED_SOURCES.has(s)) as JobSource[],
            scoringMode:         isScoringMode(changes.scoringMode) ? changes.scoringMode : undefined,
          }
        : undefined,
    };
  });

  const overlaps = Array.isArray(root.overlaps)
    ? (root.overlaps as unknown[]).map(raw => {
        const o = (raw ?? {}) as Record<string, unknown>;
        return {
          alertA: typeof o.alertA === 'string' ? o.alertA : '',
          alertB: typeof o.alertB === 'string' ? o.alertB : '',
          sharedPercent: typeof o.sharedPercent === 'number' ? o.sharedPercent : 0,
          recommendation: typeof o.recommendation === 'string' ? o.recommendation : '',
        };
      })
    : [];

  const blindSpots = Array.isArray(root.blindSpots)
    ? (root.blindSpots as unknown[]).map(raw => {
        const b = (raw ?? {}) as Record<string, unknown>;
        return {
          label: typeof b.label === 'string' ? b.label : '',
          why:   typeof b.why === 'string' ? b.why : '',
        };
      }).filter(b => b.label)
    : [];

  return { version: AI_REVIEW_SCHEMA_VERSION, overlaps, perAlert, blindSpots };
}

/** Couleur par défaut d'une piste proposée, dérivée de son rôle. */
export function colorForKind(kind: AlertKind): string {
  return ALERT_KIND_COLORS[kind];
}
