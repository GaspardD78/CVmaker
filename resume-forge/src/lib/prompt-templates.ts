import { PromptTemplate } from '@/types/ai-prompt';

/**
 * Default differentiator text, used when no custom value is set in settings.
 * The user can override this via Settings → "Atout différenciant".
 */
export const DEFAULT_DIFFERENTIATOR =
  'Jeu de cartes pédagogique conçu pour standardiser l\'évaluation technique des candidats';

/**
 * Shared rules injected into every prompt. Eliminates duplication across
 * templates and ensures consistent LLM behaviour.
 * Positioned AFTER data sections in the final prompt for better LLM attention.
 */
export const TEXT_RULES = `## Règles
- Factuel uniquement : ne jamais inventer de compétence, certification, expérience ou chiffre absent du profil fourni
- Ton naturel et direct, comme un professionnel expérimenté — pas comme une IA
- Phrases courtes, zéro remplissage, pas de superlatifs ("expert reconnu", "passionné", "dynamique")
- Mettre en **gras** les termes-clés (technologies, certifications, métriques chiffrées)
- Tirets simples " - " ou virgules, jamais de tiret cadratin "—"
- Formulations interdites : "en effet", "il convient de noter", "force est de constater", "dans le cadre de", "il est important de souligner", "n'hésitez pas", "je me permets"`;

/**
 * Alias historique de `TEXT_RULES`. Règles de rédaction libre (lettres, messages,
 * analyses), injectées dans les prompts hors CV. Le prompt « CV ciblé » (sortie
 * JSON) utilise `CV_WRITING_RULES` + `JSON_RULES` (./cv-prompt).
 */
export const SYSTEM_RULES = TEXT_RULES;



export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'adapt-summary',
    name: 'Adapter l\'accroche',
    description: 'Génère 3 versions d\'accroche adaptées à une annonce spécifique',
    template: `# Rôle
Expert en rédaction de CV professionnels.

## Objectif
Proposer 3 accroches CV (4-6 lignes max) adaptées à l'annonce ci-dessous.

## Mon profil
Nom : {prénom} {nom}
Titre : {titre}
Résumé actuel : {résumé}
Expériences : {liste_postes_cv}
Compétences : {compétences}
Certifications : {certifications}
Formations : {formations}

## L'annonce
{texte_annonce}

${SYSTEM_RULES}
- Les mots-clés de l'annonce doivent apparaître naturellement, pas plaqués artificiellement
- Si une compétence de l'annonce est absente du profil, ne pas la mentionner

## Étapes
1. Identifie les 3 critères prioritaires de l'annonce
2. Indique lesquels correspondent au profil, partiellement, ou pas du tout
3. Propose 3 accroches avec des angles réellement différents

## Format de sortie
Pour chaque version, fournis dans un bloc de code markdown :
- L'angle choisi (1 ligne)
- L'accroche (4-6 lignes max)`,
  },
  {
    id: 'ats-keywords',
    name: 'Mots-clés ATS manquants',
    description: 'Analyse les mots-clés ATS manquants par rapport à une annonce',
    template: `# Rôle
Expert en optimisation ATS pour CVs professionnels.

## Objectif
Analyser la couverture ATS de mon CV par rapport à l'annonce et proposer un plan d'action priorisé.

## Mon CV actuel
Blocs visibles : {liste_blocs_cv}
Compétences : {compétences}
Certifications : {certifications}
Formations : {formations}

## L'annonce
{texte_annonce}

${SYSTEM_RULES}
- Ne suggérer un ajout que s'il correspond à une réalité du profil (même partielle)
- Si un mot-clé est absent ET le profil non compatible, le dire — ne pas inventer

## Format de sortie

### 1. Mots-clés de l'annonce
Classe en : **Indispensables** (mentionnés plusieurs fois / "requis") | **Importants** (1 mention) | **Secondaires** (nice to have)

### 2. Correspondance
Pour chaque mot-clé, un statut parmi :
- ✅ PRÉSENT et bien formulé
- ⚠️ PRÉSENT mais mal mis en valeur → reformulation
- ➕ ABSENT mais profil compatible → suggestion d'ajout
- ❌ ABSENT et profil non compatible → ne pas mentionner

### 3. Top 5 actions
Les 5 modifications les plus impactantes, par ordre de priorité.

### 4. Score
Score de correspondance /10 avec justification en 2 lignes.`,
  },
  {
    id: 'reformulate-experience',
    name: 'Reformuler une expérience',
    description: 'Reformule un bloc expérience pour l\'adapter à une annonce',
    requiresBlock: true,
    template: `# Rôle
Expert en rédaction de CV professionnels.

## Objectif
Reformuler une expérience spécifique pour maximiser sa pertinence par rapport à l'annonce.

## L'expérience à reformuler
Poste : {titre_bloc}
Entreprise : {sous_titre_bloc}
Période : {dates_bloc}
Description actuelle : {description_bloc}

## Contexte de candidature
Poste visé : {poste_cible}
Entreprise : {entreprise_cible}
Annonce : {texte_annonce}
Certifications : {certifications}

${SYSTEM_RULES}
- Verbes d'action à l'infinitif, pas de "j'ai" ni "nous avons"
- Si la description est pauvre, poser des questions plutôt qu'inventer

## Format de sortie

### 1. Analyse
Éléments pertinents vs neutres vs à risque (tableau court).

### 2. Reformulations (dans un bloc de code markdown)
**Version A** — Courte (3-4 bullets, max 80 car/bullet)
**Version B** — Développée (5-6 bullets, avec contexte et impact)

### 3. Questions d'enrichissement
3-5 questions précises pour enrichir avec de vraies données.`,
  },
  {
    id: 'prepare-interview',
    name: 'Préparer l\'entretien',
    description: 'Prépare les questions probables et stratégie d\'entretien',
    template: `# Rôle
Coach en préparation d'entretiens professionnels.

## Objectif
Préparer un entretien ciblé avec questions probables et stratégie de réponse basée sur MES expériences réelles.

## Mon profil
Résumé : {résumé}
Expériences clés : {liste_postes_cv}
Certifications : {certifications}
Formations : {formations}
Atout différenciant : {atout_différenciant}

## Le poste
Entreprise : {entreprise_cible}
Poste : {poste_cible}
Annonce : {texte_annonce}

${SYSTEM_RULES}
- Si une question n'a pas de réponse solide dans le profil, le dire clairement
- Réponses STAR basées uniquement sur les expériences listées ci-dessus

## Format de sortie

### 1. Profil recherché
Type de structure, séniorité attendue, culture d'entreprise (3-4 lignes).

### 2. Questions probables (5-7)
Pour chaque : question | pourquoi | structure STAR | à ne pas dire.

### 3. Questions pièges (2-3)
Questions difficiles pour ce profil + comment les retourner honnêtement.

### 4. Mes questions à poser (3-4)
Questions différenciantes adaptées à ce poste/entreprise.`,
  },
  {
    id: 'application-message',
    name: 'Message de candidature',
    description: 'Génère des messages LinkedIn, email et InMail adaptés',
    requiresContactName: true,
    template: `# Rôle
Expert en communication professionnelle pour candidatures.

## Objectif
Rédiger des messages de candidature courts, différenciants et humains.

## Mon profil
Nom : {prénom} {nom}
Titre : {titre}
Résumé : {résumé}
Expériences clés : {liste_postes_courts}
Atout différenciant : {atout_différenciant}

## La cible
Entreprise : {entreprise_cible}
Poste : {poste_cible}
Contact : {contact_name}
Annonce : {texte_annonce}

${SYSTEM_RULES}
- Maximum 150 mots LinkedIn, 200 mots email
- Un seul fait différenciant mis en avant, pas une liste
- Appel à l'action simple et sans pression
- Ne jamais promettre ce que le profil ne garantit pas

## Analyse préalable
Avant de rédiger, identifie : (1) l'élément le plus distinctif du profil, (2) le problème que l'entreprise résout avec ce recrutement, (3) un point de connexion naturel parcours/entreprise.

## Format de sortie (dans des blocs de code markdown)

### LinkedIn (150 mots max)
Accroche factuelle → lien avec le poste → appel à l'action sobre.

### Email (200 mots max)
Objet court et factuel. Contexte 1 phrase → valeur ajoutée → proposition d'échange.

### InMail spontané (si pas d'annonce)
Uniquement si aucune annonce fournie. Message basé sur la cible entreprise/secteur.

Pour chaque version : *note en italique l'angle choisi et pourquoi*.`,
  },
];

export const CV_ANALYSIS_TEMPLATE: PromptTemplate = {
  id: 'cv-analysis',
  name: 'Analyse adéquation CV / Offre',
  description: 'Analyse la correspondance entre le CV et l\'annonce, retourne un JSON structuré',
  template: `# Rôle
Expert en recrutement et optimisation de CV.

## Objectif
Analyser la correspondance entre le CV et l'offre d'emploi pour identifier les forces et les manques.

## Mon profil
Résumé : {résumé}
{liste_blocs_cv}

## Offre d'emploi
{texte_annonce}

${SYSTEM_RULES}

## Format de sortie OBLIGATOIRE
Retourne UNIQUEMENT un objet JSON valide (pas de markdown, pas de texte autour).

{
  "score_global": <entier 0-100>,
  "scores": {
    "competences": <entier 0-100>,
    "experience": <entier 0-100>,
    "formation": <entier 0-100>,
    "couverture": <entier 0-100>
  },
  "points_forts": [<3-5 points clés>],
  "points_friction": [<2-4 manques ou risques>],
  "recommandations": [<3-5 actions concrètes pour le CV>],
  "mots_cles_manquants": [<liste des mots-clés importants absents>],
  "mots_cles_presents": [<liste des mots-clés présents>],
  "synthese": "<2-3 phrases de synthèse>"
}`,
};

export function getPromptTemplate(id: string): PromptTemplate | undefined {
  if (id === CV_ANALYSIS_TEMPLATE.id) return CV_ANALYSIS_TEMPLATE;
  return PROMPT_TEMPLATES.find(t => t.id === id);
}

import { Profile, MasterEntry } from '@/types/profile';

// Prompt « CV ciblé » v2 : blocs composables dans ./cv-prompt (règles texte / JSON séparées).
export { generateFullCVMatchPrompt } from './cv-prompt';

export function generateEnrichPrompt(profile: Profile, entries: MasterEntry[], jobPosting?: string): string {
  const byType = (type: MasterEntry['entryType']) => entries.filter(e => e.entryType === type);

  const fmtDates = (e: MasterEntry) =>
    (e.startDate || e.endDate || e.isCurrent)
      ? ` [${e.startDate || '?'} - ${e.isCurrent ? 'Présent' : (e.endDate || '?')}]`
      : '';
  const fmtDated = (e: MasterEntry, subtitlePrefix = 'chez') => {
    const desc = e.description ? ` : ${e.description}` : ' : (pas de description)';
    return `- ${e.title}${e.subtitle ? ` ${subtitlePrefix} ${e.subtitle}` : ''}${fmtDates(e)}${desc}`;
  };
  const fmtShort = (e: MasterEntry) =>
    `- ${e.title}${e.subtitle ? ` (${e.subtitle})` : ''}${fmtDates(e)}${e.description ? ` : ${e.description.replace(/\n/g, ' ')}` : ''}`;

  const expList = byType('experience').map(e => fmtDated(e)).join('\n');
  const eduList = byType('education').map(e => fmtShort(e)).join('\n');
  const skillList = byType('skill').map(e => e.title).join(', ');
  const certList = byType('certification').map(e => fmtShort(e)).join('\n');
  const langList = byType('language').map(e => `- ${e.title}${e.subtitle ? ` : ${e.subtitle}` : ' : (niveau non renseigné)'}`).join('\n');
  const projList = byType('project').map(e => fmtShort(e)).join('\n');
  const interestList = byType('interest').map(e => e.title).join(', ');
  const volunteerList = byType('volunteer').map(e => fmtDated(e, 'pour')).join('\n');

  return `# Rôle
Coach CV expert et mentor de carrière.

## Objectif
Auditer, nettoyer et enrichir l'INTÉGRALITÉ du profil professionnel de l'utilisateur (toutes les sections, pas seulement les expériences) à travers un dialogue constructif : cohérence d'ensemble, consolidation des redondances, puis enrichissement.

## Profil Maître (Données actuelles)
Nom : ${profile.firstName} ${profile.lastName}
Titre : ${profile.title || '(non renseigné)'}
Résumé : ${profile.summary || '(non renseigné)'}

### Expériences
${expList || '(aucune)'}

### Formations
${eduList || '(aucune)'}

### Compétences
${skillList || '(aucune)'}

### Certifications
${certList || '(aucune)'}

### Langues
${langList || '(aucune)'}

### Projets
${projList || '(aucun)'}

### Centres d'intérêt
${interestList || '(aucun)'}

### Bénévolat
${volunteerList || '(aucun)'}

${jobPosting ? `## Offre visée (Cible)\n${jobPosting.trim()}\n` : ''}

${SYSTEM_RULES}
- **COACHING ACTIF** : Ne te contente pas de poser des questions. Analyse les données fournies, identifie les forces et propose des pistes d'amélioration (ex: "Je vois que tu as géré des budgets, pourrais-tu préciser l'ordre de grandeur ?").
- **DISCUSSION** : Discute des choix de mots-clés, propose des reformulations percutantes sans les imposer. Laisse l'utilisateur valider.
- **INTERACTION** : Pose une seule question à la fois pour garder le dialogue fluide.
- **PRÉCISION** : Cherche toujours le "Combien ?" (chiffres), le "Comment ?" (méthodes) et le "Avec quoi ?" (outils).
- **CLÉ DE RAPPROCHEMENT (CRITIQUE)** : Dans le JSON final, pour MODIFIER une entrée existante, recopie EXACTEMENT son \`title\` et son \`entryType\` tels qu'ils apparaissent ci-dessus — c'est la clé qui permet à l'application de mettre à jour l'entrée au lieu d'en créer une nouvelle. Un titre différent créera une NOUVELLE entrée. Si un intitulé mérite d'être corrigé (faute, casse…), signale-le dans la discussion pour que l'utilisateur le corrige à la main, et garde le titre d'origine dans le JSON.
- **JAMAIS DE SUPPRESSION** : Tu ne peux pas supprimer ni fusionner des entrées. Si tu repères des doublons ou des entrées à retirer, signale-les explicitement dans la discussion (l'application dispose d'un outil dédié "Scanner les doublons").

## Mission
1. **AUDIT GLOBAL** : Passe en revue TOUTES les sections (expériences, formations, compétences, certifications, langues, projets, centres d'intérêt, bénévolat) par rapport aux standards du marché (et à l'offre si fournie). Résume tes constats en quelques points classés par impact.
2. **NETTOYAGE** : Repère fautes d'orthographe, incohérences de casse, formats de dates hétérogènes, puces mal formatées, jargon creux et formulations faibles. Propose les corrections.
3. **COHÉRENCE** : Vérifie la chronologie (trous ou chevauchements inexpliqués → pose la question), l'alignement entre le titre, le résumé et les expériences, la normalisation des niveaux de langue (CECRL : A1-C2), et que les compétences listées sont étayées par les expériences, projets ou certifications.
4. **CONSOLIDATION** : Repère les redondances intra et inter-sections (compétence en double, projet déjà décrit dans une expérience, certification listée aussi en formation…). Propose une version consolidée ou signale le doublon selon la règle ci-dessus.
5. **ENRICHISSEMENT** : Identifie les entrées qui manquent de "preuves" (résultats concrets, chiffres, outils) et enrichis-les via le dialogue, en commençant par l'expérience la plus stratégique.
6. **IMPORTANT : CLÔTURE** : Une fois la discussion terminée, génère la synthèse JSON.

Entame la discussion en saluant l'utilisateur, en présentant ton audit global (points 1 à 4 de manière synthétique), puis en proposant une première piste d'action.

## Format de sortie final
Dès que la conversation touche à sa fin, tu DOIS générer un bloc de code JSON contenant les champs personnels modifiés et TOUTES les entrées modifiées (nettoyées, mises en cohérence ou enrichies) ou nouvelles, toutes sections confondues. N'inclus PAS les entrées restées inchangées.

\`\`\`json
{
  "profile": {
    "title": "Titre professionnel (si modifié)",
    "summary": "Résumé (si modifié)"
  },
  "entries": [
    {
      "entryType": "experience|education|skill|certification|language|project|interest|volunteer",
      "title": "TITRE EXACT de l'entrée existante (ou nouveau titre si nouvelle entrée)",
      "subtitle": "Entreprise / École / Émetteur / Niveau de langue (selon le type)",
      "location": "Ville (optionnel)",
      "description": "Description enrichie avec des puces",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "isCurrent": false
    }
  ]
}
\`\`\``;
}

export function generateSourceConfigPrompt(
  source: string,
  profile: { title: string | null } | null,
  entries: { entryType: string; title: string }[]
): string {
  const titleStr = profile?.title ? profile.title : 'Non renseigné';
  const skills = entries
    .filter(e => e.entryType === 'skill')
    .map(e => e.title)
    .join(', ');

  const skillsStr = skills ? skills : 'Aucune compétence renseignée';

  return `Agis comme un expert en recrutement technique et sourcing.
Je configure une veille d'emploi automatisée sur la plateforme : ${source}.
Voici mon profil :
- Titre : ${titleStr}
- Compétences : ${skillsStr}

Le moteur de recherche de cette plateforme a ses propres spécificités. Pour m'aider à configurer mon outil de veille, fournis-moi :
1. Une liste de 5 à 10 mots-clés POSITIFS très précis (séparés par des virgules) qui maximiseront la pertinence sur CETTE plateforme spécifiquement.
2. Une liste de 5 mots-clés NÉGATIFS (à exclure) pour filtrer le bruit (ex: stage, alternance, etc.) (séparés par des virgules).
3. (Si pertinent) La requête de recherche exacte (ex: booléenne) que je pourrais utiliser.

Réponds de manière très concise pour que je puisse facilement copier-coller les listes de mots-clés.`;
}

// ── Prompts d'analyse de la veille (dépréciés) ──────────────────────────────
//
// Spec 005 : les deux générateurs d'origine sont remplacés par
// `generateWatchAnalysisPrompt(ctx, mode)` (lib/watcher/analysis-prompt.ts), qui
// reçoit un contexte factuel complet. Les anciens noms restent comme adaptateurs
// minces pour les appelants qui n'ont que l'ancienne information.

import type { SearchProfile } from '@/types/job-watch';
import { DEFAULT_SEARCH_PROFILE } from '@/types/job-watch';
import { buildWatchAnalysisContext, type FeedbackAction, type WatchAnalysisContext } from '@/lib/watcher/analysis-context';
import { generateWatchAnalysisPrompt } from '@/lib/watcher/analysis-prompt';

/** @deprecated Les métriques sont désormais calculées par `buildWatchAnalysisContext`. */
interface PerformanceMetrics {
  volumePerWeek: number;
  pertinencePercent: number | null;
  conversionPercent: number | null;
  learnedPositive: string[];
  learnedNegative: string[];
}

/** @deprecated Contexte de portefeuille de l'ancienne API. */
export interface AlertPromptContext {
  alertName: string;
  /** Autres pistes : nom et intitulés visés. */
  otherAlerts: Array<{ name: string; jobTitles: string[] }>;
  /**
   * Couverture par source déjà rendue en Markdown (`renderCoverageSection`) :
   * statut de chaque source, part dans l'échantillon, avertissement de biais.
   */
  coverageSection?: string;
}

/** @deprecated Ligne d'offre de l'ancienne API (les champs optionnels enrichissent le prompt). */
export interface LegacyOfferRow {
  title: string;
  score: number;
  action: string | null;
  company?: string | null;
  location?: string | null;
  source?: string;
  snippet?: string | null;
}

const LEGACY_ACTIONS = new Set(['kanban_import', 'thumbs_up', 'thumbs_down', 'quick_archive']);

function legacyContext(
  searchProfile: SearchProfile,
  offers: LegacyOfferRow[],
  candidate: { title: string | null; mainSkills: string[] },
  context?: AlertPromptContext,
): WatchAnalysisContext {
  const now = new Date();
  return buildWatchAnalysisContext({
    now,
    alert: {
      id: 'legacy', name: context?.alertName ?? searchProfile.name, searchProfile,
      learnedDict: { positive: {}, negative: {} },
    },
    otherAlerts: (context?.otherAlerts ?? []).map((a, i) => ({
      id: `other-${i}`, name: a.name, searchProfile: { ...DEFAULT_SEARCH_PROFILE, jobTitles: a.jobTitles },
    })),
    candidate: { ...candidate, city: null, experienceYears: null },
    offers: offers.map((o, i) => ({
      id: `legacy-${i}`, source: o.source ?? 'inconnue', title: o.title, company: o.company ?? null,
      location: o.location ?? null, contractType: null, salaryMin: null, salaryMax: null, salaryRaw: null,
      publishedAt: null, fetchedAt: now.toISOString(), storedScore: o.score, snippet: o.snippet ?? null,
      isRead: false, kanban: o.action === 'kanban_import',
      actions: o.action && LEGACY_ACTIONS.has(o.action) ? [o.action as FeedbackAction] : [],
    })),
  });
}

/**
 * @deprecated Utiliser `generateWatchAnalysisPrompt(ctx, 'performance')`.
 * Adaptateur : sans offres ni dénominateurs, les métriques sont celles passées en argument.
 */
export function generatePerformanceOptimizationPrompt(
  profile: { title: string | null } | null,
  entries: { entryType: string; title: string }[],
  searchProfile: SearchProfile,
  metrics: PerformanceMetrics,
  context?: AlertPromptContext,
): string {
  const ctx = legacyContext(searchProfile, [], {
    title: profile?.title ?? null,
    mainSkills: entries.filter(e => e.entryType === 'skill').map(e => e.title).slice(0, 10),
  }, context);
  const withMetrics: WatchAnalysisContext = {
    ...ctx,
    metrics: {
      ...ctx.metrics,
      perWeek: metrics.volumePerWeek,
      zeroAction: false,
      pertinence: { percent: metrics.pertinencePercent, numerator: 0, denominator: 0 },
      conversion: { percent: metrics.conversionPercent, numerator: 0, denominator: 0 },
    },
    learned: {
      fromTitlesOnly: true,
      signals: [
        ...metrics.learnedPositive.map(term => ({ term, count: 3, sense: 'positive' as const, conflict: false })),
        ...metrics.learnedNegative.map(term => ({ term, count: 3, sense: 'negative' as const, conflict: false })),
      ],
    },
  };
  return `${context?.coverageSection ?? ''}${generateWatchAnalysisPrompt(withMetrics, 'performance')}`;
}

/** @deprecated Utiliser `generateWatchAnalysisPrompt(ctx, 'diagnostic')`. */
export function generateDiagnosticPrompt(
  searchProfile: SearchProfile,
  recentOffers: LegacyOfferRow[],
  context?: AlertPromptContext,
): string {
  return `${context?.coverageSection ?? ''}${generateWatchAnalysisPrompt(
    legacyContext(searchProfile, recentOffers, { title: null, mainSkills: [] }, context),
    'diagnostic',
  )}`;
}


/**
 * Generates a French cover letter prompt from profile + offer context.
 */
export function generateCoverLetterPrompt(
  profile: Profile,
  entries: MasterEntry[],
  jobOfferText: string,
  options: { contactName?: string; style: 'formal' | 'direct' } = { style: 'direct' }
): string {
  const recentExperiences = entries
    .filter(e => e.entryType === 'experience')
    .slice(0, 4)
    .map(e => {
      const dates = (e.startDate || e.endDate) ? `${e.startDate || '?'} - ${e.endDate || 'Présent'}` : 'Non précisée';
      return `- ${e.title}${e.subtitle ? ` chez ${e.subtitle}` : ''} (${dates})${e.description ? ` : ${e.description.replace(/\n/g, ' ').slice(0, 120)}` : ''}`;
    })
    .join('\n');

  const skills = entries.filter(e => e.entryType === 'skill').map(e => e.title).join(', ');
  const certifications = entries.filter(e => e.entryType === 'certification').map(e => e.title).join(', ');

  const styleInstruction = options.style === 'formal'
    ? "Style formel et structuré. Vouvoiement. Introduction conventionnelle mais personnalisée."
    : "Style direct et humain. Vouvoiement. Aller droit au but dès la première ligne. Pas d'introduction bateau.";

  const contactStr = options.contactName
    ? `Adressée à : ${options.contactName}`
    : "Destinataire non renseigné (adapter l'appel)";

  return `Tu es expert en rédaction de lettres de motivation professionnelles en français.

## Règles absolues
- Jamais de formules creuses : "Je me permets de vous contacter", "Passionné par", "Dynamique", "Rigoureux"
- Jamais de tiret cadratin "—" : utiliser " - " ou une virgule
- Jamais de marqueurs IA : "en effet", "il convient de noter", "force est de constater", "dans le cadre de"
- Ne jamais inventer une compétence, expérience ou certification absente du profil
- Maximum 3 paragraphes de 4-5 lignes chacun
- Mettre en **gras** 2-3 éléments différenciants maximum
- ${styleInstruction}
- La lettre doit sonner comme écrite par un humain qui connaît bien sa valeur

## Mon profil
Prénom / Nom : ${profile.firstName} ${profile.lastName}
Titre actuel : ${profile.title ?? 'Non renseigné'}
Résumé : ${profile.summary ?? 'Non renseigné'}

## Mes expériences récentes
${recentExperiences || 'Aucune expérience renseignée'}

## Mes compétences clés
${skills || 'Aucune compétence renseignée'}

## Certifications
${certifications || 'Aucune'}

## L'offre à laquelle je postule
${jobOfferText}

## ${contactStr}

## Ta mission
Rédige une lettre de motivation en Markdown avec :
1. Une accroche percutante (1-2 phrases) qui prouve que j'ai lu l'annonce
2. Un paragraphe "Pourquoi je corresponds" : 2-3 faits concrets directement liés aux exigences
3. Un paragraphe "Ce que j'apporte" : ma valeur ajoutée spécifique pour CE poste
4. Une conclusion sobre avec une proposition d'échange claire

Après la lettre, ajoute une section ## Justification avec 3 bullets expliquant tes choix.`;
}
