/**
 * Prompt « CV ciblé » v2, assemblé à partir de blocs composables et testables.
 *
 * Le LLM est externe : l'app génère ce prompt, l'utilisateur le colle, puis
 * recolle le JSON (`parseAiCvResponse` → `guardAiCv` → `applyAiCvToBlocks`).
 * Chaque bloc est une fonction pure ; `buildCvPrompt` les assemble dans l'ordre
 * qui donne la meilleure attention au modèle (données d'abord, règles et schéma
 * en dernier).
 *
 * Deux jeux de règles distincts : `CV_WRITING_RULES` (rédaction du contenu) et
 * `JSON_RULES` (forme de la sortie). Le `SYSTEM_RULES` générique des autres
 * prompts (texte libre) n'est plus utilisé ici.
 */
import type { MasterEntry, Profile } from '@/types/profile';
import { experienceYears, suggestPageBudget } from './cv-experience';

/** Nombre de puces d'un CV d'une page (base du budget de volume du prompt et du garde-fou). */
export const BULLETS_PER_PAGE = 18;
/** Longueur maximale d'une puce, en caractères. */
export const MAX_BULLET_CHARS = 120;
/** Nombre maximal de puces par expérience. */
export const MAX_BULLETS_PER_EXPERIENCE = 5;

/** Libellés français standard des sections (identifiants de `sectionOrder` / `sectionLabels`). */
export const STANDARD_SECTION_LABELS = [
  'Expériences Professionnelles', 'Formations', 'Compétences', 'Certifications', 'Langues', 'Projets',
  "Centres d'intérêt", 'Bénévolat',
] as const;

export interface CvPromptOptions {
  /** Pages visées ; défaut : 1 jusqu'à 8 ans d'expérience, sinon 2. */
  pageBudget?: number;
  /** Date de référence du calcul d'expérience (tests déterministes) ; défaut : maintenant. */
  now?: Date;
}

export interface CvPromptInput {
  profile: Profile;
  entries: MasterEntry[];
  jobOfferText: string;
  targetCompany?: string;
  extraContext?: string;
  clarify?: boolean;
  options?: CvPromptOptions;
}

/**
 * Protocole de clarification (optionnel) : le LLM peut poser quelques questions à
 * fort impact AVANT de produire le JSON, sans transformer le flux en interview.
 */
export const CLARIFY_PROTOCOL = `## Avant de générer - affinage par questions (léger)
Si, ET SEULEMENT SI, une information à fort impact manque pour bien cibler le CV, pose d'abord des questions courtes puis ARRÊTE-TOI et attends mes réponses. Sinon, produis directement le JSON sans rien demander.
- Maximum **3 questions**, une ligne chacune, numérotées, avec une **réponse par défaut entre crochets** que je peux valider d'un mot.
- Zéro question triviale ou cosmétique. Priorise : poste réellement visé, arbitrage entre expériences concurrentes, éléments à mettre en avant ou masquer, séniorité/ton attendus.
- Si je réponds, ou si j'écris « génère » / « ok », produis IMMÉDIATEMENT le JSON final (et UNIQUEMENT le JSON).`;

/** Règles de rédaction du contenu (la forme de la sortie est dans `JSON_RULES`). */
export const CV_WRITING_RULES = `### Style et rédaction
- Puce = verbe d'action + quoi + outil ou méthode + résultat. Le résultat n'apparaît que s'il figure dans la source. Postes terminés : verbes au passé ; poste actuel : verbes au présent. Pas de pronoms (« j'ai », « nous », « I », « we »).
- Interdits : tâches génériques (« responsable de », « en charge de », « responsible for »), superlatifs (« expert reconnu », « excellent »), jargon creux, adjectifs d'auto-promotion (« passionné », « dynamique », « motivé »), « en effet », « dans le cadre de », « il convient de », « force est de constater », tiret cadratin « — » (utilise « - » ou une virgule).
- Gras (**) autorisé uniquement sur des technologies ou des résultats chiffrés présents dans la source, 2 par puce au maximum. Aucun autre markdown que les puces « - ».
- Homogénéité : même casse pour tous les intitulés, même ponctuation de fin de puce (aucun point final), pas de datesOverride sauf nécessité (le format des dates est géré par l'application).
- Typographie. Français : espace insécable avant « : ; ? ! », guillemets « ». Anglais : virgule d'Oxford systématique, mois abrégés au format « Mon YYYY » si tu dois écrire une date.`;

/** Règles de forme de la sortie JSON. */
export const JSON_RULES = `### Forme de la réponse
- Réponds UNIQUEMENT avec l'objet JSON du schéma : pas de texte avant ou après, pas de markdown, pas de bloc de code.
- JSON strict : guillemets doubles, aucune virgule finale, aucun commentaire. Les sauts de ligne d'une description s'écrivent \\n.
- Respecte l'ordre des clés du schéma : "analyse" d'abord, puis le reste. Omets un champ optionnel plutôt que de mettre null, "" ou [].
- Recopie les IDs EXACTEMENT comme dans le profil maître. N'invente aucun ID.`;

// ── Blocs de données ─────────────────────────────────────────────────────────

const q = (value: string | null | undefined): string => `"${(value ?? '').replace(/"/g, "'")}"`;

function describeDates(e: MasterEntry): string {
  if (!e.startDate && !e.endDate && !e.isCurrent) return 'Non précisée';
  return `${e.startDate || '?'} - ${e.isCurrent ? 'Présent' : e.endDate || '?'}`;
}

/** Description sur plusieurs lignes, une puce source par ligne (la structure source est conservée). */
function describeBody(e: MasterEntry, label = 'Description'): string {
  const text = (e.description ?? '').trim();
  if (!text) return `\n  ${label} : (aucune)`;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean).map(l => `    ${l}`);
  return `\n  ${label} :\n${lines.join('\n')}`;
}

function section(entries: MasterEntry[], type: MasterEntry['entryType'], format: (e: MasterEntry) => string, empty: string): string {
  const lines = entries.filter(e => e.entryType === type).map(format);
  return lines.length > 0 ? lines.join('\n') : empty;
}

export function buildRole(): string {
  return `# Rôle
Tu es recruteur senior IT et cybersécurité et expert ATS. Tu optimises un CV pour UNE annonce, sans jamais rien inventer.`;
}

export function buildObjective(): string {
  return `## Objectif
Produire UN objet JSON (schéma en fin de prompt) qui sélectionne, ordonne et reformule les éléments du profil maître pour cette annonce. Tu ne crées aucune donnée : tu choisis, tu ordonnes, tu reformules. Les écarts entre le profil et l'annonce sont signalés, jamais comblés.`;
}

export function buildContext(input: CvPromptInput): string {
  const { profile, entries, jobOfferText, targetCompany, options } = input;
  const years = experienceYears(entries, options?.now);
  const pages = options?.pageBudget ?? suggestPageBudget(years);
  const lines = [
    '## Contexte',
    targetCompany ? `Entreprise cible : ${targetCompany}` : '',
    `Pages visées : ${pages}`,
    `Durée d'expérience professionnelle calculée depuis les dates du profil : ${years === 0 ? "moins d'un an" : `${years} an${years > 1 ? 's' : ''}`} (valeur à utiliser dans l'accroche, sans l'arrondir à la hausse)`,
    profile.title ? `Titre actuel du profil : ${profile.title}` : '',
    `Annonce :\n<<<\n${jobOfferText.trim()}\n>>>`,
  ];
  return lines.filter(Boolean).join('\n');
}

export function buildMasterProfile(entries: MasterEntry[], profile?: Profile): string {
  const experiences = section(entries, 'experience',
    e => `- ID: ${q(e.id)} | Titre: ${q(e.title)} | Entreprise: ${q(e.subtitle)} | Dates: ${q(describeDates(e))}${describeBody(e)}`, '(aucune)');
  const skills = section(entries, 'skill', e => `- ID: ${q(e.id)} | Titre: ${q(e.title)}`, '(aucune)');
  const education = section(entries, 'education',
    e => `- ID: ${q(e.id)} | Diplôme: ${q(e.title)} | École: ${q(e.subtitle)} | Dates: ${q(describeDates(e))}`, '(aucune)');
  const certifications = section(entries, 'certification',
    e => `- ID: ${q(e.id)} | Titre: ${q(e.title)} | Émetteur: ${q(e.subtitle)}`, '(aucune)');
  const languages = section(entries, 'language',
    e => `- ID: ${q(e.id)} | Langue: ${q(e.title)} | Niveau: ${q(e.subtitle || '(non renseigné)')}`, '(aucune)');
  const projects = section(entries, 'project',
    e => `- ID: ${q(e.id)} | Titre: ${q(e.title)}${describeBody(e, 'Détail')}`, '(aucun)');
  const interests = section(entries, 'interest', e => `- ID: ${q(e.id)} | Titre: ${q(e.title)}`, '(aucun)');
  const volunteer = section(entries, 'volunteer',
    e => `- ID: ${q(e.id)} | Titre: ${q(e.title)} | Organisation: ${q(e.subtitle)}`, '(aucun)');

  return `## Profil maître (données sources)
${profile?.summary ? `Résumé actuel du profil : ${profile.summary.replace(/\n/g, ' ')}\n\n` : ''}### Expériences
${experiences}

### Compétences
${skills}

### Formations
${education}

### Certifications
${certifications}

### Langues
${languages}

### Projets
${projects}

### Centres d'intérêt
${interests}

### Bénévolat
${volunteer}`;
}

export function buildExtraContext(extraContext?: string): string {
  const trimmed = extraContext?.trim();
  return `## Contexte additionnel (source UNIQUE des entrées suggérées)
${trimmed || '(aucun - donc "suggestedEntries" DOIT être un tableau vide)'}`;
}

export function buildAnalysisStep(): string {
  return `## Étape 0 - Analyse (remplis "analyse" EN PREMIER dans le JSON)
- langue_annonce : code ISO 639-1 de la langue de l'annonce (fr, en, de...).
- indispensables : 5 à 8 exigences, formulation EXACTE de l'annonce (mots-clés tels qu'écrits).
- importants : 3 à 5 exigences secondaires.
- correspondances : pour chaque indispensable, l'ID de l'entrée du profil qui l'étaye, ou null s'il n'y en a pas.
- ecarts : les indispensables sans preuve dans le profil. À signaler, JAMAIS à combler : ne les reformule pas pour qu'ils paraissent couverts.
Appuie ensuite toutes tes décisions (sélection, ordre, accroche) sur cette analyse.`;
}

export function buildRules(input: CvPromptInput): string {
  const { entries, options } = input;
  const years = experienceYears(entries, options?.now);
  const pages = options?.pageBudget ?? suggestPageBudget(years);
  const labels = STANDARD_SECTION_LABELS.map(l => `"${l}"`).join(', ');
  return `## Règles
### Langue
- TOUT le contenu produit (title, summary, descriptions, overrides, sectionLabels) est rédigé dans la langue de l'annonce (analyse.langue_annonce).
- Traduis « Présent » (sans datesOverride : l'application s'en charge) et les niveaux de langue (« Courant » devient « Fluent » en anglais). Ne traduis pas les noms propres, employeurs, intitulés de diplômes, certifications, technologies. Un intitulé de poste peut être traduit fidèlement (titleOverride).
- Si l'annonce n'est pas en français, renseigne "sectionLabels" : clés = libellés standard (${labels}), valeurs = libellés dans la langue de l'annonce.

### Structure
- Ne supprime, ne renomme et ne fusionne aucune section. La section « Compétences » garde son libellé (sectionLabels sert uniquement à la traduire). Une section sans entrée visible est masquée automatiquement.
- Liste dans "entries" TOUTES les entrées du profil maître, avec \`visible: true\` si utile pour l'annonce, \`visible: false\` sinon. Une entrée absente de "entries" reste affichée telle quelle.
- Langues : garde visibles uniquement les langues utiles, c'est-à-dire exigées par l'annonce ou, à défaut, les langues autres que celle du CV dont un niveau est renseigné. La langue de l'annonce passe en premier. Ne relève jamais un niveau (pas de « C1 » si la source dit « Courant »).

### Contenu
- TITRE ("title") : l'intitulé de l'annonce seulement s'il est cohérent avec les postes réellement tenus ; sinon « {intitulé réellement tenu} - {mot-clé de l'annonce} ». Jamais un poste que le profil n'a pas occupé.
- ACCROCHE ("summary", 2 à 3 phrases) : intitulé + nombre d'années d'expérience (valeur calculée ci-dessus) + domaine ; 2 preuves reliées aux indispensables ; 3 à 4 mots-clés exacts de l'annonce. Profil senior : périmètre, pilotage, résultats. Profil junior : projets, certifications, stack.
- PUCES (champ "description" : une puce par ligne, préfixée par « - », séparées par \\n) : ${MAX_BULLETS_PER_EXPERIENCE - 2} à ${MAX_BULLETS_PER_EXPERIENCE} puces pour une expérience récente ou pertinente, 2 à 3 pour une plus ancienne, ${MAX_BULLET_CHARS} caractères maximum par puce, la plus pertinente en premier. Conserve tous les chiffres de la source, n'en ajoute aucun.
- MOTS-CLÉS ATS : chaque indispensable étayé apparaît au moins une fois sous sa forme exacte (titre, accroche, compétences ou puces). Si l'annonce emploie un sigle et sa forme longue, écris les deux une fois (« SIEM (Security Information and Event Management) »).
- VOLUME : ${pages} page${pages > 1 ? 's' : ''} maximum, soit environ ${pages * BULLETS_PER_PAGE} puces au total. Priorité aux 5 dernières années et aux expériences qui couvrent un indispensable ; masque ou raccourcis le reste.
- COMPÉTENCES : masque les non pertinentes, ordonne par pertinence. Utilise "skillGroups" seulement s'il y a au moins 8 compétences visibles : 2 à 4 groupes, au moins 2 compétences par groupe, libellés dans la langue de l'annonce, chaque compétence visible dans un seul groupe. Sinon omets "skillGroups".
- ORDRE : le plus pertinent d'abord, entre les sections ("sectionOrder", avec les libellés standard ci-dessus) et à l'intérieur de chaque section ("entryOrder").
- SURCHARGES D'AFFICHAGE (optionnelles) : "titleOverride" (libellé principal), "subtitleOverride" (libellé secondaire : entreprise, école, niveau de langue traduit, émetteur). Uniquement si l'annonce justifie un affichage différent de la source ; elles ne modifient jamais le profil.

### Anti-invention (règle absolue)
- Aucun chiffre, pourcentage, outil, certification, employeur, diplôme, date ou niveau absent des données fournies (profil maître et contexte additionnel). Une compétence de l'annonce absente du profil n'est ni ajoutée ni suggérée : elle va dans analyse.ecarts.
- Si une puce manque de résultat chiffré, ne l'invente pas : ajoute dans "warnings" une question de quantification à mon intention (ex. « Poste X : combien d'utilisateurs ou d'alertes par jour ? »).
- "suggestedEntries" ne peut contenir QUE des éléments directement et explicitement étayés par le contexte additionnel, absents du profil maître, jamais déduits de l'annonce. Contexte additionnel vide ou sans élément pertinent : "suggestedEntries": [].

${CV_WRITING_RULES}`;
}

export function buildClarify(clarify: boolean | undefined): string {
  return clarify ? CLARIFY_PROTOCOL : '';
}

export function buildOutputSchema(): string {
  return `## Format de sortie OBLIGATOIRE
${JSON_RULES}

Schéma (les valeurs entre parenthèses décrivent le contenu attendu ; les champs marqués "optionnel" s'omettent s'ils ne servent pas) :

{
  "schemaVersion": 2,
  "analyse": {
    "langue_annonce": "(code ISO : fr, en...)",
    "indispensables": ["(exigence, formulation exacte de l'annonce)"],
    "importants": ["(exigence secondaire)"],
    "correspondances": [{ "exigence": "(un indispensable)", "entryId": "(ID de l'entrée qui l'étaye, ou null)" }],
    "ecarts": ["(indispensable sans preuve dans le profil)"]
  },
  "title": "(intitulé réel, avec le mot-clé de l'annonce si cohérent)",
  "summary": "(accroche de 2 à 3 phrases)",
  "entries": [
    {
      "id": "[ID EXACT DE L'ENTRÉE]",
      "visible": true,
      "description": "- verbe d'action + quoi + outil + résultat sourcé\\n- puce suivante",
      "titleOverride": "(optionnel) libellé principal à afficher",
      "subtitleOverride": "(optionnel) libellé secondaire : entreprise, école, niveau de langue traduit, émetteur",
      "datesOverride": "(optionnel, à éviter) période à afficher telle quelle"
    }
  ],
  "entryOrder": ["(optionnel) id de l'entrée la plus pertinente", "id suivante"],
  "sectionOrder": ["(optionnel) Compétences", "Expériences Professionnelles"],
  "sectionLabels": { "(optionnel) Compétences": "(libellé dans la langue de l'annonce)" },
  "skillGroups": [{ "category": "(optionnel) libellé de catégorie", "entryIds": ["id_skill_1", "id_skill_2"] }],
  "suggestedEntries": [
    {
      "entryType": "experience|education|skill|certification|language|project|interest|volunteer",
      "title": "(intitulé issu du contexte additionnel)",
      "subtitle": "(optionnel) entreprise / école",
      "startDate": "YYYY-MM (optionnel)",
      "endDate": "YYYY-MM (optionnel)",
      "isCurrent": false,
      "description": "- point clé issu du contexte",
      "reason": "(optionnel) pourquoi c'est pertinent pour l'annonce"
    }
  ],
  "warnings": ["(optionnel) questions de quantification, points à vérifier"]
}`;
}

/** Assemble le prompt « CV ciblé » v2. */
export function buildCvPrompt(input: CvPromptInput): string {
  return [
    buildRole(),
    buildObjective(),
    buildContext(input),
    buildMasterProfile(input.entries, input.profile),
    buildExtraContext(input.extraContext),
    buildAnalysisStep(),
    buildRules(input),
    buildClarify(input.clarify),
    buildOutputSchema(),
  ].filter(Boolean).join('\n\n');
}

/**
 * Point d'entrée historique (signature conservée pour `CvGeneratorDrawer` et
 * `AIPromptPanel`). Le 1er argument (profil) fournit désormais le titre et le
 * résumé actuels comme source.
 */
export function generateFullCVMatchPrompt(
  profile: Profile,
  entries: MasterEntry[],
  jobOfferText: string,
  targetCompany?: string,
  extraContext?: string,
  clarify = false,
  options?: CvPromptOptions,
): string {
  return buildCvPrompt({ profile, entries, jobOfferText, targetCompany, extraContext, clarify, options });
}
