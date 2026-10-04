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
import { DEFAULT_TARGET_PAGES, experienceYears } from './cv-experience';
import { displayTitle } from './entry-display';
import { bulletItems, isSkillCategory } from './skill-lines';
import { buildAngle, buildAngleChoice } from './cv-angle-prompt';
import type { AngleSpec } from './cv-angles';

/** Nombre de puces d'un CV d'une page (base du budget de volume du prompt et du garde-fou). */
export const BULLETS_PER_PAGE = 18;
/** Limites imposées quand la cible est 1 page (prompt et garde-fou partagent ces valeurs). */
export const ONE_PAGE_LIMITS = {
  /** Accroche : 3 lignes, soit environ 330 caractères. */
  summaryLines: 3,
  summaryChars: 330,
  /** Expériences des `recentYears` dernières années ou couvrant un indispensable. */
  recentBullets: 3,
  recentYears: 5,
  /** Expériences terminées depuis `recentYears` à `midYears` ans. */
  midBullets: 2,
  midYears: 10,
  /** Plus anciennes : une ligne (titre, employeur, dates), aucune description. */
  olderBullets: 0,
  /** Catégories de compétences visibles (entrées \`skill\` à puces, lib/skill-lines.ts). */
  minSkillCategories: 3,
  maxSkillCategories: 5,
  /** Éléments de compétences visibles au total : puces des catégories + compétences isolées. */
  minSkillItems: 12,
  maxSkillItems: 15,
  maxEducation: 2,
  maxCertifications: 3,
} as const;

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
  /** Pages cibles (réglage « Pages cibles ») ; défaut : 1, quelle que soit l'ancienneté. */
  pageBudget?: number;
  /** Date de référence du calcul d'expérience (tests déterministes) ; défaut : maintenant. */
  now?: Date;
  /** Règles personnelles du candidat (réglage par profil) ; bloc omis si vide. */
  personalRules?: string;
  /** Angle imposé (bibliothèque ou proposition retenue). Prime sur `angleChoices`. */
  angle?: AngleSpec;
  /** Bibliothèque d'angles : le LLM choisit et l'indique dans analyse.angle. */
  angleChoices?: AngleSpec[];
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

/** Intitulé du bloc des règles personnelles (placé avant `CV_WRITING_RULES`). */
export const PERSONAL_RULES_HEADING = "Règles personnelles du candidat : priorité absolue, elles priment sur l'annonce";

/** Clé du réglage « Règles personnelles » d'un profil (table `settings`, clé/valeur globale). */
export function personalRulesKey(profileId: string): string {
  return `cv_personal_rules:${profileId}`;
}

/**
 * Modèle vide proposé dans les Paramètres (aucune donnée : le candidat le remplit).
 * Les critères de recherche servent aussi aux alertes \`analyse.alertes_cap\`.
 */
export const PERSONAL_RULES_TEMPLATE = `Faits à respecter
1. (ce qui ne doit jamais être affirmé, chiffres exacts à reprendre tels quels)

Style
(longueur des phrases, mots à éviter, usage du gras)

Critères de recherche
(télétravail, temps de trajet, rémunération minimale, langues exigées, horaires)`;

/**
 * Bloc des règles personnelles, saisies par le candidat (faits à respecter,
 * style, critères de recherche). Chaîne vide quand le texte est vide : le bloc
 * est alors omis du prompt.
 */
export function buildPersonalRules(text?: string | null): string {
  const trimmed = text?.trim();
  return trimmed ? `### ${PERSONAL_RULES_HEADING}\n${trimmed}` : '';
}

/** Règles de forme de la sortie JSON. */
export const JSON_RULES = `### Forme de la réponse
- Réponds UNIQUEMENT avec l'objet JSON du schéma : pas de texte avant ou après, pas de markdown, pas de bloc de code.
- JSON strict : guillemets doubles, aucune virgule finale, aucun commentaire. Les sauts de ligne d'une description s'écrivent \\n.
- Respecte l'ordre des clés du schéma : "analyse" d'abord, puis le reste. Omets un champ optionnel plutôt que de mettre null, "" ou [].
- Recopie les IDs EXACTEMENT comme dans le profil maître. N'invente aucun ID.`;

// ── Blocs de données ─────────────────────────────────────────────────────────

const q = (value: string | null | undefined): string => `"${(value ?? '').replace(/"/g, "'")}"`;
/** Titre propre (sans l'employeur en double, lib/entry-display.ts) ; l'ID reste la clé. */
const t = (e: MasterEntry): string => q(displayTitle(e.title, e.subtitle));

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
  const { entries, jobOfferText, targetCompany, options } = input;
  const years = experienceYears(entries, options?.now);
  const pages = options?.pageBudget ?? DEFAULT_TARGET_PAGES;
  const lines = [
    '## Contexte',
    targetCompany ? `Entreprise cible : ${targetCompany}` : '',
    `Pages cibles : ${pages}`,
    `Durée d'expérience professionnelle calculée depuis les dates du profil : ${years === 0 ? "moins d'un an" : `${years} an${years > 1 ? 's' : ''}`} (valeur à utiliser dans l'accroche, sans l'arrondir à la hausse)`,
    `Annonce :\n<<<\n${jobOfferText.trim()}\n>>>`,
  ];
  return lines.filter(Boolean).join('\n');
}

export interface MasterProfileOptions {
  /** Affiche les tags d'angle (`angle:<slug>`, `hide:<slug>`) de chaque entrée (prompt d'angles). */
  angleTags?: boolean;
}

export function buildMasterProfile(entries: MasterEntry[], profile?: Profile, opts: MasterProfileOptions = {}): string {
  const tg = (e: MasterEntry): string => {
    if (!opts.angleTags) return '';
    const tags = (Array.isArray(e.tags) ? e.tags : []).filter(t => /^(angle|hide):/.test(t));
    return tags.length > 0 ? ` | Tags: ${tags.join(', ')}` : '';
  };
  const experiences = section(entries, 'experience',
    e => `- ID: ${q(e.id)} | Titre: ${t(e)} | Entreprise: ${q(e.subtitle)} | Dates: ${q(describeDates(e))}${tg(e)}${describeBody(e)}`, '(aucune)');
  // Catégorie (compétence à puces) : le LLM voit ses éléments ; compétence isolée : son titre.
  const skills = section(entries, 'skill', e => (isSkillCategory(e)
    ? `- ID: ${q(e.id)} | Catégorie: ${q(e.title)} | Éléments: ${bulletItems(e.description).join(' ; ')}${tg(e)}`
    : `- ID: ${q(e.id)} | Titre: ${q(e.title)}${tg(e)}`), '(aucune)');
  const education = section(entries, 'education',
    e => `- ID: ${q(e.id)} | Diplôme: ${t(e)} | École: ${q(e.subtitle)} | Dates: ${q(describeDates(e))}${tg(e)}`, '(aucune)');
  const certifications = section(entries, 'certification',
    e => `- ID: ${q(e.id)} | Titre: ${q(e.title)} | Émetteur: ${q(e.subtitle)}${tg(e)}`, '(aucune)');
  const languages = section(entries, 'language',
    e => `- ID: ${q(e.id)} | Langue: ${q(e.title)} | Niveau: ${q(e.subtitle || '(non renseigné)')}${tg(e)}`, '(aucune)');
  const projects = section(entries, 'project',
    e => `- ID: ${q(e.id)} | Titre: ${t(e)}${tg(e)}${describeBody(e, 'Détail')}`, '(aucun)');
  const interests = section(entries, 'interest', e => `- ID: ${q(e.id)} | Titre: ${q(e.title)}${tg(e)}`, '(aucun)');
  const volunteer = section(entries, 'volunteer',
    e => `- ID: ${q(e.id)} | Titre: ${t(e)} | Organisation: ${q(e.subtitle)}${tg(e)}`, '(aucun)');

  return `## Profil maître (données sources)
${buildTrajectory(profile)}### Expériences
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

/**
 * Trajectoire du profil (titre et résumé choisis par le candidat) : source du
 * ton de l'accroche. Vide quand le profil n'a ni titre ni résumé.
 */
function buildTrajectory(profile?: Profile): string {
  const lines = [
    profile?.title ? `- Titre du profil : ${profile.title}` : '',
    profile?.summary ? `- Résumé du profil : ${profile.summary.replace(/\n/g, ' ')}` : '',
  ].filter(Boolean);
  return lines.length > 0 ? `### Trajectoire du profil (source du ton de l'accroche)\n${lines.join('\n')}\n\n` : '';
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

/** Règles de contenu imposées pour une cible d'une page (remplacent PUCES, VOLUME et COMPÉTENCES). */
export function buildOnePageRules(): string {
  const L = ONE_PAGE_LIMITS;
  return `- UNE PAGE (contrainte stricte, prioritaire sur toute autre consigne de volume) :
  - RÉSUMÉ : ${L.summaryLines} lignes maximum (environ ${L.summaryChars} caractères).
  - EXPÉRIENCES des ${L.recentYears} dernières années ou couvrant un indispensable de l'annonce : ${L.recentBullets} puces maximum chacune. Expériences terminées depuis ${L.recentYears} à ${L.midYears} ans : ${L.midBullets} puces maximum. Plus anciennes : 1 ligne (titre, employeur, dates : omets "description"). Une expérience sans lien avec l'annonce : \`visible: false\`.
  - COMPÉTENCES : ${L.minSkillCategories} à ${L.maxSkillCategories} catégories visibles et ${L.minSkillItems} à ${L.maxSkillItems} éléments au total (compte les éléments, pas les entrées : une compétence isolée compte pour 1), les plus pertinents d'abord (entryOrder), les autres \`visible: false\`.
  - FORMATIONS et CERTIFICATIONS : uniquement les plus récentes ou les plus pertinentes, une ligne chacune (aucune description). Les autres \`visible: false\`.
  - CENTRES D'INTÉRÊT et BÉNÉVOLAT : \`visible: false\`, sauf s'ils servent directement l'annonce.
  - Si le tout dépasse encore 1 page, masque d'abord ce qui est le moins lié à l'annonce.`;
}

/**
 * Règle TITRE. Le titre du profil est un positionnement choisi par le candidat :
 * autorisé tel quel, ou suivi d'un mot-clé de l'annonce. Les intitulés des
 * expériences ne changent jamais. Sans titre de profil : règle historique.
 */
export function buildTitleRule(profile?: Pick<Profile, 'title'> | null, angle?: Pick<AngleSpec, 'titleRule'>): string {
  const own = profile?.title?.trim();
  if (own && angle?.titleRule === 'profile') {
    return `- TITRE ("title") : « ${own} » tel quel (positionnement choisi par le candidat, règle de l'angle). Aucun autre intitulé. Ne modifie jamais l'intitulé d'une expérience pour coller à l'annonce.`;
  }
  if (own) {
    return `- TITRE ("title") : « ${own} » tel quel (positionnement choisi par le candidat), ou « ${own} - {mot-clé de l'annonce} ». Aucun autre intitulé. Ne modifie jamais l'intitulé d'une expérience pour coller à l'annonce.`;
  }
  return `- TITRE ("title") : l'intitulé de l'annonce seulement s'il est cohérent avec les postes réellement tenus ; sinon « {intitulé réellement tenu} - {mot-clé de l'annonce} ». Jamais un poste que le profil n'a pas occupé.`;
}

export function buildRules(input: CvPromptInput): string {
  const pages = input.options?.pageBudget ?? DEFAULT_TARGET_PAGES;
  const onePage = pages === 1;
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
${buildTitleRule(input.profile, input.options?.angle)}
- ACCROCHE ("summary", ${onePage ? `${ONE_PAGE_LIMITS.summaryLines} lignes maximum` : '2 à 3 phrases'}) : intitulé + nombre d'années d'expérience (valeur calculée ci-dessus) + domaine ; 2 preuves reliées aux indispensables ; 3 à 4 mots-clés exacts de l'annonce. Profil senior : périmètre, pilotage, résultats. Profil junior : projets, certifications, stack.
- PUCES (champ "description" : une puce par ligne, préfixée par « - », séparées par \\n) : ${onePage ? '' : `${MAX_BULLETS_PER_EXPERIENCE - 2} à ${MAX_BULLETS_PER_EXPERIENCE} puces pour une expérience récente ou pertinente, 2 à 3 pour une plus ancienne, `}${MAX_BULLET_CHARS} caractères maximum par puce, la plus pertinente en premier. Conserve tous les chiffres de la source, n'en ajoute aucun.${onePage ? ' Les nombres de puces sont fixés par la règle UNE PAGE ci-dessous.' : ''}
- MOTS-CLÉS ATS : chaque indispensable étayé apparaît au moins une fois sous sa forme exacte (titre, accroche, compétences ou puces). Si l'annonce emploie un sigle et sa forme longue, écris les deux une fois (« SIEM (Security Information and Event Management) »).
${onePage ? buildOnePageRules() : `- VOLUME : ${pages} pages maximum, soit environ ${pages * BULLETS_PER_PAGE} puces au total. Priorité aux 5 dernières années et aux expériences qui couvrent un indispensable ; masque ou raccourcis le reste.
- COMPÉTENCES : masque les non pertinentes, ordonne par pertinence. Utilise "skillGroups" seulement s'il y a au moins 8 compétences visibles : 2 à 4 groupes, au moins 2 compétences par groupe, libellés dans la langue de l'annonce, chaque compétence visible dans un seul groupe. Sinon omets "skillGroups".`}
- CATÉGORIES DE COMPÉTENCES (entrées listées avec « Catégorie » et « Éléments ») : la catégorie garde son titre. Tu peux réduire et réordonner ses éléments dans "description" (une puce « - » par élément, le plus pertinent d'abord), en recopiant uniquement des éléments existants de la source, mot pour mot. Aucun ajout, aucune reformulation. "skillGroups" ne concerne que les compétences isolées (listées avec « Titre »), jamais une catégorie.
- ORDRE : le plus pertinent d'abord, entre les sections ("sectionOrder", avec les libellés standard ci-dessus) et à l'intérieur de chaque section ("entryOrder").
- SURCHARGES D'AFFICHAGE (optionnelles) : "titleOverride" (libellé principal), "subtitleOverride" (libellé secondaire : entreprise, école, niveau de langue traduit, émetteur). Uniquement si l'annonce justifie un affichage différent de la source ; elles ne modifient jamais le profil.

### Anti-invention (règle absolue)
- Aucun chiffre, pourcentage, outil, certification, employeur, diplôme, date ou niveau absent des données fournies (profil maître et contexte additionnel). Une compétence de l'annonce absente du profil n'est ni ajoutée ni suggérée : elle va dans analyse.ecarts.
- Si une puce manque de résultat chiffré, ne l'invente pas : ajoute dans "warnings" une question de quantification à mon intention (ex. « Poste X : combien d'utilisateurs ou d'alertes par jour ? »).
- "suggestedEntries" ne peut contenir QUE des éléments directement et explicitement étayés par le contexte additionnel, absents du profil maître, jamais déduits de l'annonce. Contexte additionnel vide ou sans élément pertinent : "suggestedEntries": [].

${[buildPersonalRules(input.options?.personalRules), CV_WRITING_RULES].filter(Boolean).join('\n\n')}`;
}

export function buildClarify(clarify: boolean | undefined): string {
  return clarify ? CLARIFY_PROTOCOL : '';
}

export interface OutputSchemaOptions {
  /** Ajoute analyse.angle (choix de l'angle laissé à l'IA). */
  angleChoice?: boolean;
}

export function buildOutputSchema(opts: OutputSchemaOptions = {}): string {
  const angleField = opts.angleChoice
    ? ',\n    "angle": { "slug": "(slug de l\'angle choisi dans la bibliothèque)", "raison": "(une phrase, liée à des indispensables)" }'
    : '';
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
    "ecarts": ["(indispensable sans preuve dans le profil)"]${angleField}
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

/** Bloc d'angle : imposé, à choisir dans la bibliothèque, ou rien. */
export function buildAngleBlock(input: CvPromptInput): string {
  const { angle, angleChoices } = input.options ?? {};
  if (angle) return buildAngle(angle, input.entries, input.profile);
  if (angleChoices && angleChoices.length > 0) return buildAngleChoice(angleChoices, input.entries, input.profile);
  return '';
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
    buildAngleBlock(input),
    buildRules(input),
    buildClarify(input.clarify),
    buildOutputSchema({ angleChoice: !input.options?.angle && (input.options?.angleChoices?.length ?? 0) > 0 }),
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
