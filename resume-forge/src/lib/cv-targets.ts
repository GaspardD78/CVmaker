import { normalizeBulletFocus, type BulletFocus } from './cv-focus-rules';

/**
 * Ciblage du CV : type de structure, intention de la démarche, premier lecteur.
 *
 * Les fiches par type sont des DONNÉES de rédaction (ce que ce lecteur cherche, le
 * vocabulaire attendu), jamais des faits de CV : l'anti-invention ne change pas.
 * Ce module est pur (aucune base, aucun prompt) ; le texte du prompt est dans
 * `cv-target-prompt.ts`.
 */

export const TARGET_TYPES = ['esn', 'cabinet', 'grand-groupe', 'eti-pme', 'startup', 'public', 'associatif'] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const INTENTS = ['annonce', 'spontanee', 'recommandation', 'mobilite-interne', 'chasseur'] as const;
export type Intent = (typeof INTENTS)[number];

export const FIRST_READERS = ['rh', 'operationnel', 'direction', 'ats'] as const;
export type FirstReader = (typeof FIRST_READERS)[number];

export type Auto<T> = T | 'auto';

/**
 * Règle de titre :
 * - `profile` : titre du profil tel quel ;
 * - `profile+keyword` : titre du profil, éventuellement suivi d'un mot-clé de la cible ;
 * - `equivalence` : titre du profil traduit via les équivalences de la fiche, à défaut
 *   l'intitulé exact d'une expérience du profil, à défaut le titre du profil (avec avertissement) ;
 * - `free` : titre proposé conservé tel quel (choix manuel, hors positionnement habituel).
 */
export type TargetTitleRule = 'profile' | 'profile+keyword' | 'equivalence' | 'free';

export interface Equivalence {
  from: string;
  to: string;
}

export interface TargetSheet {
  type: TargetType;
  label: string;
  /** Ce que ce lecteur cherche à vérifier. */
  attentes: string[];
  /** Ce qu'il faut mettre en avant. */
  valorise: string[];
  /** Ce qui dessert (consignes en texte libre). */
  eviter: string[];
  /** Termes détectables par le garde-fou (mots, pas des phrases). */
  avoidTerms: string[];
  vocabulaire: {
    registre: string;
    privilegier: string[];
    /** Équivalences autorisées d'un terme vers le terme attendu par ce lecteur. */
    equivalences: Equivalence[];
  };
  focusParDefaut: BulletFocus;
  titreParDefaut: TargetTitleRule;
  /** Active la règle des mots-clés ATS (sous réserve de l'intention et du lecteur). */
  ats: boolean;
  /** Suggestions de rendu. */
  affichage: {
    photo: 'oui' | 'non' | 'indifferent';
    longueur: string;
    sections: string;
  };
  /** `public` seulement. Catégorie et filière ne sont jamais déduites : reprises de l'annonce (voir `TargetChoice`). */
  publicFields?: { frenchOnly: boolean; savoirs: boolean };
}

const PUBLIC_EQUIVALENCES: Equivalence[] = [
  { from: 'Talent Acquisition Manager', to: 'Responsable recrutement' },
  { from: 'Talent Acquisition Partner', to: 'Chargé de recrutement' },
  { from: 'hiring manager', to: 'manager opérationnel' },
  { from: 'practice lead', to: 'responsable de pôle' },
  { from: 'sourcing', to: 'recherche de candidats' },
  { from: 'pipeline', to: 'vivier de candidats' },
  { from: 'candidate experience', to: 'accueil et suivi des candidats' },
  { from: 'expérience candidat', to: 'accueil et suivi des candidats' },
  { from: 'staffing', to: 'affectation sur les projets' },
  { from: 'cooptation', to: 'recommandation interne' },
];

/** Fiches de départ : génériques, sans donnée personnelle. */
export const DEFAULT_TARGET_SHEETS: Readonly<Record<TargetType, TargetSheet>> = {
  esn: {
    type: 'esn',
    label: 'ESN / société de conseil',
    attentes: [
      'réactivité', 'volumes et délais de recrutement', 'compréhension des métiers techniques',
      'relation avec les commerciaux et les managers', 'staffing des projets', 'rétention des consultants',
      'connaissance des technologies et des niveaux d\'expertise', 'gestion de l\'intercontrat',
    ],
    valorise: [
      'réactivité et rythme de recrutement', 'délais de recrutement', 'recrutement pour des projets au forfait',
      'relation avec les commerciaux et les managers', 'staffing de projets', 'fidélisation des consultants',
    ],
    eviter: ['jargon RH abstrait', 'processus longs'],
    avoidTerms: [],
    vocabulaire: {
      registre: 'direct, orienté projets, délais et profils techniques',
      privilegier: ['consultants', 'profils techniques', 'projets', 'délais', 'staffing'],
      equivalences: [],
    },
    focusParDefaut: 'resultats',
    titreParDefaut: 'profile+keyword',
    ats: true,
    affichage: { photo: 'indifferent', longueur: '1 page, 2 si le parcours le justifie', sections: 'expériences en premier, compétences techniques comprises' },
  },
  cabinet: {
    type: 'cabinet',
    label: 'Cabinet de recrutement, chasse, intérim',
    attentes: [
      'chasse et approche directe', 'connaissance d\'un marché', 'relation client et candidat',
      'portefeuille de postes', 'autonomie commerciale',
    ],
    valorise: [
      'approche directe et connaissance du marché', 'portefeuille de postes', 'présentation de shortlists',
      'relation avec les clients donneurs d\'ordre', 'suivi des candidats après embauche', 'autonomie commerciale',
    ],
    eviter: ['vocabulaire purement interne d\'entreprise'],
    avoidTerms: [],
    vocabulaire: {
      registre: 'commercial et relationnel, orienté marché, clients et candidats',
      privilegier: ['clients', 'candidats', 'marché', 'mandats', 'shortlist'],
      equivalences: [],
    },
    focusParDefaut: 'resultats',
    titreParDefaut: 'profile+keyword',
    ats: true,
    affichage: { photo: 'indifferent', longueur: '1 à 2 pages', sections: 'expériences en premier, marchés et clients traités visibles' },
  },
  'grand-groupe': {
    type: 'grand-groupe',
    label: 'Grand groupe',
    attentes: [
      'process structurés', 'travail en transverse', 'maîtrise des outils (ATS, SIRH)',
      'conformité et non-discrimination', 'marque employeur', 'conduite de projets RH',
    ],
    valorise: [
      'volumes d\'alternance', 'relations écoles et alternance', 'travail avec les RRH et HRBP', 'mobilité interne',
      'outils (ATS, SIRH)', 'conformité et non-discrimination', 'marque employeur', 'conduite de projets RH',
    ],
    eviter: ['posture « couteau suisse » sans cadre'],
    avoidTerms: [],
    vocabulaire: {
      registre: 'structuré et organisé, orienté process, transverse et parties prenantes',
      privilegier: ['process', 'parties prenantes', 'transverse', 'RRH', 'projets RH'],
      equivalences: [],
    },
    focusParDefaut: 'missions',
    titreParDefaut: 'profile',
    ats: true,
    affichage: { photo: 'indifferent', longueur: '1 à 2 pages', sections: 'expériences, puis outils et projets RH' },
  },
  'eti-pme': {
    type: 'eti-pme',
    label: 'ETI / PME',
    attentes: [
      'polyvalence', 'recrutement de bout en bout', 'proximité avec la direction',
      'mise en place d\'outils et de procédures',
    ],
    valorise: ['recrutement de bout en bout', 'autonomie', 'proximité avec la direction', 'outils et procédures mis en place'],
    eviter: ['hyper-spécialisation', 'sigles de grand groupe'],
    avoidTerms: [],
    vocabulaire: {
      registre: 'concret et polyvalent, orienté terrain et autonomie',
      privilegier: ['de bout en bout', 'direction', 'autonomie', 'mise en place'],
      equivalences: [],
    },
    focusParDefaut: 'missions',
    titreParDefaut: 'profile+keyword',
    ats: false,
    affichage: { photo: 'indifferent', longueur: '1 page', sections: 'expériences en premier' },
  },
  startup: {
    type: 'startup',
    label: 'Start-up',
    attentes: ['construction d\'une fonction', 'autonomie', 'vitesse', 'marque employeur', 'outils modernes'],
    valorise: ['construction d\'une fonction recrutement', 'autonomie', 'rythme de recrutement', 'marque employeur', 'outils modernes'],
    eviter: ['formalisme', 'process lourds'],
    avoidTerms: [],
    vocabulaire: {
      registre: 'direct, concret, orienté action et résultats',
      privilegier: ['construire', 'lancer', 'autonomie', 'outils'],
      equivalences: [],
    },
    focusParDefaut: 'resultats',
    titreParDefaut: 'profile+keyword',
    ats: false,
    affichage: { photo: 'indifferent', longueur: '1 page', sections: 'expériences en premier, outils visibles' },
  },
  public: {
    type: 'public',
    label: 'Fonction publique (État, territoriale, hospitalière)',
    attentes: [
      'missions et périmètre', 'cadre réglementaire', 'égalité de traitement et prévention des discriminations',
      'travail avec les encadrants', 'procédures', 'rigueur', 'service rendu',
    ],
    valorise: [
      'missions et périmètre', 'cadre réglementaire et procédures', 'recrutements collectifs et concours',
      'accompagnement des encadrants', 'prévention des discriminations et égalité de traitement', 'service rendu',
    ],
    eviter: ['anglicismes', 'vocabulaire commercial', 'chiffres de performance individuelle', 'photo'],
    avoidTerms: [
      'business', 'placement', 'chasse', 'chasseur', 'sourcing', 'talent acquisition', 'hiring manager',
      'practice lead', 'KPI', 'deal', 'pipeline', 'TJM', 'intercontrat', 'staffing',
    ],
    vocabulaire: {
      registre: 'administratif et sobre, en français, orienté missions, cadre et service rendu',
      privilegier: ['missions', 'agents', 'encadrants', 'procédure', 'service', 'recrutement'],
      equivalences: PUBLIC_EQUIVALENCES,
    },
    focusParDefaut: 'missions',
    titreParDefaut: 'equivalence',
    ats: false,
    affichage: { photo: 'non', longueur: '1 à 2 pages', sections: 'formation et concours visibles, expériences par missions' },
    publicFields: { frenchOnly: true, savoirs: true },
  },
  associatif: {
    type: 'associatif',
    label: 'Association, ESS, fondation',
    attentes: ['sens et valeurs', 'polyvalence', 'travail avec bénévoles et partenaires', 'sobriété des moyens'],
    valorise: ['adhésion aux valeurs', 'polyvalence', 'travail avec les bénévoles et les partenaires', 'sobriété des moyens'],
    eviter: ['registre commercial agressif'],
    avoidTerms: ['business', 'deal', 'KPI', 'chasse'],
    vocabulaire: {
      registre: 'sobre et engagé, orienté sens, partenaires et collectif',
      privilegier: ['partenaires', 'bénévoles', 'collectif', 'projet associatif'],
      equivalences: [
        { from: 'KPI', to: 'indicateurs de suivi' },
        { from: 'business', to: 'activité' },
      ],
    },
    focusParDefaut: 'missions',
    titreParDefaut: 'equivalence',
    ats: false,
    affichage: { photo: 'indifferent', longueur: '1 page', sections: 'expériences, engagements et bénévolat visibles' },
  },
};

// ── Personnalisation par profil (`cv_target_sheets:{profileId}`) ─────────────

/** Champs modifiés d'une fiche (seuls ceux-ci sont enregistrés). */
export type SheetOverride = {
  [K in keyof TargetSheet]?: TargetSheet[K] extends object | undefined ? Partial<NonNullable<TargetSheet[K]>> | TargetSheet[K] : TargetSheet[K];
};
export type SheetOverrides = Partial<Record<TargetType, SheetOverride>>;

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const stringList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim()) : undefined;
const TITLE_RULES: readonly TargetTitleRule[] = ['profile', 'profile+keyword', 'equivalence', 'free'];

function parseEquivalences(v: unknown): Equivalence[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isRecord)
    .map(e => ({ from: typeof e.from === 'string' ? e.from.trim() : '', to: typeof e.to === 'string' ? e.to.trim() : '' }))
    .filter(e => e.from && e.to);
}

function parseOverride(raw: unknown): SheetOverride | undefined {
  if (!isRecord(raw)) return undefined;
  const o: SheetOverride = {};
  for (const key of ['attentes', 'valorise', 'eviter', 'avoidTerms'] as const) {
    const list = stringList(raw[key]);
    if (list) o[key] = list;
  }
  if (typeof raw.label === 'string' && raw.label.trim()) o.label = raw.label.trim();
  const focus = normalizeBulletFocus(raw.focusParDefaut);
  if (focus) o.focusParDefaut = focus;
  if (TITLE_RULES.includes(raw.titreParDefaut as TargetTitleRule)) o.titreParDefaut = raw.titreParDefaut as TargetTitleRule;
  if (typeof raw.ats === 'boolean') o.ats = raw.ats;
  if (isRecord(raw.vocabulaire)) {
    const v: Partial<TargetSheet['vocabulaire']> = {};
    if (typeof raw.vocabulaire.registre === 'string') v.registre = raw.vocabulaire.registre;
    const priv = stringList(raw.vocabulaire.privilegier);
    if (priv) v.privilegier = priv;
    const eq = parseEquivalences(raw.vocabulaire.equivalences);
    if (eq) v.equivalences = eq;
    if (Object.keys(v).length > 0) o.vocabulaire = v;
  }
  if (isRecord(raw.affichage)) {
    const a: Partial<TargetSheet['affichage']> = {};
    if (['oui', 'non', 'indifferent'].includes(raw.affichage.photo as string)) a.photo = raw.affichage.photo as 'oui' | 'non' | 'indifferent';
    if (typeof raw.affichage.longueur === 'string') a.longueur = raw.affichage.longueur;
    if (typeof raw.affichage.sections === 'string') a.sections = raw.affichage.sections;
    if (Object.keys(a).length > 0) o.affichage = a;
  }
  return Object.keys(o).length > 0 ? o : undefined;
}

/** Lit `cv_target_sheets:{profileId}` (JSON) ; toute valeur illisible est ignorée, jamais d'exception. */
export function parseSheetOverrides(raw: string | null | undefined): SheetOverrides {
  if (!raw) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return {}; }
  if (!isRecord(parsed)) return {};
  const out: SheetOverrides = {};
  for (const type of TARGET_TYPES) {
    const o = parseOverride(parsed[type]);
    if (o) out[type] = o;
  }
  return out;
}

export function serializeSheetOverrides(overrides: SheetOverrides): string {
  return JSON.stringify(overrides);
}

/** Fiche par défaut du type, surchargée champ par champ (les sous-objets sont fusionnés). */
export function sheetFor(type: TargetType, overrides: SheetOverrides = {}): TargetSheet {
  const base = DEFAULT_TARGET_SHEETS[type];
  const o = overrides[type] as Partial<TargetSheet> | undefined;
  if (!o) return base;
  return {
    ...base,
    ...o,
    type,
    vocabulaire: { ...base.vocabulaire, ...(o.vocabulaire ?? {}) },
    affichage: { ...base.affichage, ...(o.affichage ?? {}) },
    ...(base.publicFields ? { publicFields: base.publicFields } : {}),
  };
}

/** Surcharges sans la fiche `type` : « Revenir aux valeurs par défaut ». */
export function resetSheet(overrides: SheetOverrides, type: TargetType): SheetOverrides {
  const { [type]: _removed, ...rest } = overrides;
  return rest;
}

// ── Résolution ───────────────────────────────────────────────────────────────

/** Choix explicite de l'utilisateur sur ce CV (`auto` ou absent : pas de choix). */
export interface TargetChoice {
  type?: Auto<TargetType>;
  intent?: Auto<Intent>;
  firstReader?: Auto<FirstReader>;
  /** « Ce que valorise ce lecteur » : jamais cité dans le CV. */
  readerNote?: string;
  /** Types `public` seulement, repris de l'annonce, jamais déduits pour le candidat. */
  publicDetails?: { categorie?: 'A' | 'B' | 'C'; filiere?: string };
}

/** Axes détectés par l'application (texte de l'annonce, nom de l'entreprise) ou par l'IA. */
export interface DetectedTarget {
  type?: TargetType;
  intent?: Intent;
  firstReader?: FirstReader;
}

export type AxisSource = 'explicit' | 'detected' | 'default';

export interface ResolvedTarget {
  /** `null` : aucun type connu, donc aucune fiche (prompt inchangé). */
  type: TargetType | null;
  intent: Intent;
  /** `null` : premier lecteur inconnu. */
  firstReader: FirstReader | null;
  sheet: TargetSheet | null;
  sources: { type: AxisSource; intent: AxisSource; firstReader: AxisSource };
  readerNote?: string;
  publicDetails?: { categorie?: 'A' | 'B' | 'C'; filiere?: string };
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined;

function pick<T extends string>(
  list: readonly T[],
  explicit: unknown,
  detected: unknown,
): { value: T | undefined; source: AxisSource } {
  const e = oneOf(list, explicit);
  if (e) return { value: e, source: 'explicit' };
  const d = oneOf(list, detected);
  if (d) return { value: d, source: 'detected' };
  return { value: undefined, source: 'default' };
}

/**
 * Ciblage effectif d'un CV : choix explicite > détection > défaut. Sans type connu, pas de
 * fiche ; sans intention connue, `annonce` (comportement historique).
 */
export function resolveTarget(
  choice: TargetChoice | null | undefined,
  profileOverrides: SheetOverrides = {},
  detected: DetectedTarget | null | undefined = undefined,
): ResolvedTarget {
  const type = pick(TARGET_TYPES, choice?.type, detected?.type);
  const intent = pick(INTENTS, choice?.intent, detected?.intent);
  const reader = pick(FIRST_READERS, choice?.firstReader, detected?.firstReader);
  const resolved: ResolvedTarget = {
    type: type.value ?? null,
    intent: intent.value ?? 'annonce',
    firstReader: reader.value ?? null,
    sheet: type.value ? sheetFor(type.value, profileOverrides) : null,
    sources: { type: type.source, intent: intent.source, firstReader: reader.source },
  };
  const note = choice?.readerNote?.trim();
  if (note) resolved.readerNote = note;
  if (type.value === 'public' && choice?.publicDetails) {
    const { categorie, filiere } = choice.publicDetails;
    const details: NonNullable<ResolvedTarget['publicDetails']> = {};
    if (categorie === 'A' || categorie === 'B' || categorie === 'C') details.categorie = categorie;
    if (filiere?.trim()) details.filiere = filiere.trim();
    if (Object.keys(details).length > 0) resolved.publicDetails = details;
  }
  return resolved;
}

/** Orientation par défaut de la cible (3e paramètre de `resolveBulletFocus`) ; `undefined` sans fiche. */
export function defaultFocusFor(target: ResolvedTarget): BulletFocus | undefined {
  return target.sheet?.focusParDefaut;
}

/**
 * Règle « MOTS-CLÉS ATS » active ? Jamais hors réponse à une annonce (spontanée,
 * recommandation, mobilité interne, chasseur). Pour une annonce : lecteur `ats` = oui,
 * lecteur opérationnel ou direction = non, sinon la fiche ; sans fiche, oui (historique).
 */
export function atsEnabledFor(target: ResolvedTarget): boolean {
  if (target.intent !== 'annonce') return false;
  if (target.firstReader === 'ats') return true;
  if (target.firstReader === 'operationnel' || target.firstReader === 'direction') return false;
  return target.sheet?.ats ?? true;
}

/** Règle de titre par défaut ; sans fiche, la règle historique (`profile+keyword`). */
export function titleRuleFor(target: ResolvedTarget): TargetTitleRule {
  return target.sheet?.titreParDefaut ?? 'profile+keyword';
}
