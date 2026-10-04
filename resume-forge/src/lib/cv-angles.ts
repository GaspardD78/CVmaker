/**
 * Angles de CV : fiches qui orientent la sélection et l'ordre du contenu pour
 * un type de poste. Un angle ne contient aucun fait de CV : il choisit et
 * ordonne, il ne produit rien.
 *
 * - La fiche (table `cv_angles`) porte la règle de titre, le gabarit d'accroche
 *   à créneaux, l'ordre des catégories de compétences, des consignes de
 *   vocabulaire et la politique des anciennes expériences.
 * - L'affinité des entrées vit dans `master_entries.tags` : `angle:<slug>` met
 *   l'entrée en tête, `hide:<slug>` la masque par défaut. Les autres étiquettes
 *   (« UX/UI »…) ne sont jamais touchées.
 *
 * Fonctions pures, partagées par le store, l'écran des Paramètres, le prompt et
 * le garde-fou.
 */
import type { EntryType, MasterEntry } from '@/types/profile';
import { normalizeLabel } from './cv-sections';

export type TitleRule = 'profile' | 'profile+keyword';
export type OlderPolicy = 'one-line' | 'short';

/** Une ligne de `cv_angles`. */
export interface CvAngle {
  id: string;
  profileId: string;
  slug: string;
  label: string;
  titleRule: TitleRule;
  /** Gabarit à créneaux (« {intitulé} depuis {année}, … »), jamais du texte final. */
  summaryStructure: string;
  /** Titres de catégories de compétences, dans l'ordre. */
  skillCategoryOrder: string[];
  vocabulary: string;
  olderPolicy: OlderPolicy;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Champs éditables d'un angle. */
export type CvAngleFields = Pick<CvAngle, 'slug' | 'label' | 'titleRule' | 'summaryStructure' | 'skillCategoryOrder' | 'vocabulary' | 'olderPolicy'>;

/**
 * Angle prêt à l'emploi pour un CV : la fiche et les entrées en tête et masquées.
 * Pour un angle de la bibliothèque, les listes viennent des tags
 * (`resolveAngle`) ; pour une proposition du mode 2, du JSON du LLM.
 */
export interface AngleSpec extends Omit<CvAngleFields, 'slug'> {
  /** `null` : proposition non enregistrée dans la bibliothèque. */
  slug: string | null;
  leadEntryIds: string[];
  hideEntryIds: string[];
}

/** Instantané enregistré dans `cv.settings.cvAngle` (l'historique ne suit pas les modifications de la bibliothèque). */
export interface CvAngleSnapshot {
  slug: string | null;
  label: string;
  titleRule: TitleRule;
  leadEntryIds: string[];
  hideEntryIds: string[];
  skillCategoryOrder: string[];
  /** `library` : angle de la bibliothèque ; `proposal` : proposition du mode 2 ; `auto` : choisi par l'IA. */
  source: 'library' | 'proposal' | 'auto';
}

/** Plafond d'angles par profil (store et interface). */
export const MAX_ANGLES_PER_PROFILE = 4;

/** Angles de départ, génériques (aucun employeur, aucune donnée personnelle). */
export const DEFAULT_ANGLES: readonly CvAngleFields[] = [
  {
    slug: 'partner-it-cyber',
    label: 'Partenaire IT et cyber',
    titleRule: 'profile',
    summaryStructure: '{intitulé} depuis {année}, {spécialités}, {rôle de conseil auprès de la direction et des hiring managers}, {formation des équipes à l\'entretien}',
    skillCategoryOrder: ['Conseil & évaluation', 'Recrutement', 'Sourcing & LinkedIn', 'Formation & projets RH'],
    vocabulary: 'Vocabulaire du recrutement IT et de la cybersécurité. Aucun volume annuel de recrutement.',
    olderPolicy: 'one-line',
  },
  {
    slug: 'evaluation-formation',
    label: 'Évaluation et formation',
    titleRule: 'profile',
    summaryStructure: '{intitulé} depuis {année}, {évaluation des candidats}, {formation des managers à l\'entretien}, {preuve de formation}, {formation académique}',
    skillCategoryOrder: ['Formation & projets RH', 'Conseil & évaluation', 'Recrutement'],
    vocabulary: 'Vocabulaire neutre : « profils techniques » au lieu des sigles de métier.',
    olderPolicy: 'one-line',
  },
  {
    slug: 'projets-rh',
    label: 'Projets RH',
    titleRule: 'profile',
    summaryStructure: '{intitulé} depuis {année}, {conception de dispositifs RH}, {outillage}, {marque employeur}',
    skillCategoryOrder: ['Formation & projets RH', 'Conseil & évaluation', 'Recrutement'],
    vocabulary: 'Ne jamais présenter ces missions comme un poste de chef de projet.',
    olderPolicy: 'one-line',
  },
];

// ── Slugs et tags ────────────────────────────────────────────────────────────

/** Slug d'un libellé : minuscules, sans accents, mots séparés par « - ». */
export function slugify(label: string): string {
  return normalizeLabel(label).replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Slug libre (absent de `taken`) dérivé de `label` : « x », puis « x-2 », « x-3 »… */
export function uniqueSlug(label: string, taken: readonly string[]): string {
  const base = slugify(label) || 'angle';
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export const leadTag = (slug: string): string => `angle:${slug}`;
export const hideTag = (slug: string): string => `hide:${slug}`;

export type Affinity = 'lead' | 'neutral' | 'hide';

/** Tags d'une entrée, tolérant une valeur non tableau (donnée ancienne). */
export function entryTags(entry: Pick<MasterEntry, 'tags'>): string[] {
  return Array.isArray(entry.tags) ? entry.tags.filter((t): t is string => typeof t === 'string') : [];
}

/** Affinité d'une entrée pour un angle. `hide:` prime si les deux tags coexistent. */
export function entryAffinity(tags: readonly string[], slug: string): Affinity {
  if (tags.includes(hideTag(slug))) return 'hide';
  if (tags.includes(leadTag(slug))) return 'lead';
  return 'neutral';
}

/** Nouveaux tags après réglage de l'affinité ; les autres tags (autres angles, étiquettes) sont conservés. */
export function withAffinity(tags: readonly string[], slug: string, affinity: Affinity): string[] {
  const kept = tags.filter(t => t !== leadTag(slug) && t !== hideTag(slug));
  if (affinity === 'lead') kept.push(leadTag(slug));
  if (affinity === 'hide') kept.push(hideTag(slug));
  return kept;
}

/** Cycle d'une cellule de la matrice : neutre → en tête → masquée → neutre. */
export function nextAffinity(a: Affinity): Affinity {
  return a === 'neutral' ? 'lead' : a === 'lead' ? 'hide' : 'neutral';
}

/** Tags retirés quand un angle est supprimé (les étiquettes non liées restent). */
export function withoutAngleTags(tags: readonly string[], slug: string): string[] {
  return withAffinity(tags, slug, 'neutral');
}

// ── Angle effectif ───────────────────────────────────────────────────────────

/** Titres des catégories de compétences existantes, dans l'ordre demandé ; un titre absent est ignoré. */
export function existingCategoryOrder(order: readonly string[], entries: readonly MasterEntry[]): string[] {
  const titles = new Map(entries.filter(e => e.entryType === 'skill').map(e => [normalizeLabel(e.title), e.title] as const));
  const out: string[] = [];
  for (const t of order) {
    const found = titles.get(normalizeLabel(t));
    if (found && !out.includes(found)) out.push(found);
  }
  return out;
}

/** Angle de la bibliothèque résolu d'après les tags des entrées (ordre des entrées conservé). */
export function resolveAngle(angle: CvAngleFields, entries: readonly MasterEntry[]): AngleSpec {
  const leadEntryIds: string[] = [];
  const hideEntryIds: string[] = [];
  for (const e of entries) {
    const a = entryAffinity(entryTags(e), angle.slug);
    if (a === 'lead') leadEntryIds.push(e.id);
    else if (a === 'hide') hideEntryIds.push(e.id);
  }
  return { ...angle, leadEntryIds, hideEntryIds };
}

/** Instantané à enregistrer dans `cv.settings.cvAngle`. */
export function angleSnapshot(spec: AngleSpec, source: CvAngleSnapshot['source']): CvAngleSnapshot {
  return {
    slug: spec.slug,
    label: spec.label,
    titleRule: spec.titleRule,
    leadEntryIds: [...spec.leadEntryIds],
    hideEntryIds: [...spec.hideEntryIds],
    skillCategoryOrder: [...spec.skillCategoryOrder],
    source,
  };
}

/** Lit l'instantané d'un CV (`cv.settings.cvAngle`) ; `null` s'il est absent ou invalide. */
export function readAngleSnapshot(settings: Record<string, unknown> | null | undefined): CvAngleSnapshot | null {
  const raw = settings?.cvAngle;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.label !== 'string' || !r.label.trim()) return null;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    slug: typeof r.slug === 'string' ? r.slug : null,
    label: r.label,
    titleRule: r.titleRule === 'profile+keyword' ? 'profile+keyword' : 'profile',
    leadEntryIds: ids(r.leadEntryIds),
    hideEntryIds: ids(r.hideEntryIds),
    skillCategoryOrder: ids(r.skillCategoryOrder),
    source: r.source === 'proposal' || r.source === 'auto' ? r.source : 'library',
  };
}

// ── Ligne SQL ↔ objet ────────────────────────────────────────────────────────

export const normalizeTitleRule = (v: unknown): TitleRule => (v === 'profile+keyword' ? 'profile+keyword' : 'profile');
export const normalizeOlderPolicy = (v: unknown): OlderPolicy => (v === 'short' ? 'short' : 'one-line');

function parseStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v !== 'string') return [];
  try {
    return parseStringArray(JSON.parse(v));
  } catch {
    return [];
  }
}

/** Ligne SQLite (`snake_case`) → `CvAngle`. */
export function rowToAngle(row: Record<string, unknown>): CvAngle {
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    id: s(row.id),
    profileId: s(row.profile_id),
    slug: s(row.slug),
    label: s(row.label),
    titleRule: normalizeTitleRule(row.title_rule),
    summaryStructure: s(row.summary_structure),
    skillCategoryOrder: parseStringArray(row.skill_category_order),
    vocabulary: s(row.vocabulary),
    olderPolicy: normalizeOlderPolicy(row.older_policy),
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : Number(row.sort_order) || 0,
    createdAt: s(row.created_at),
    updatedAt: s(row.updated_at),
  };
}

/** Champs éditables → colonnes SQLite (`skill_category_order` en JSON). */
export function fieldsToRow(fields: Partial<CvAngleFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (fields.slug !== undefined) row.slug = fields.slug;
  if (fields.label !== undefined) row.label = fields.label;
  if (fields.titleRule !== undefined) row.title_rule = normalizeTitleRule(fields.titleRule);
  if (fields.summaryStructure !== undefined) row.summary_structure = fields.summaryStructure;
  if (fields.skillCategoryOrder !== undefined) row.skill_category_order = JSON.stringify(fields.skillCategoryOrder);
  if (fields.vocabulary !== undefined) row.vocabulary = fields.vocabulary;
  if (fields.olderPolicy !== undefined) row.older_policy = normalizeOlderPolicy(fields.olderPolicy);
  return row;
}

// ── Fichier d'affinités (local, choisi par l'utilisateur, jamais versionné) ──

export interface AffinityFileRow {
  entryType: EntryType;
  title: string;
  tags: string[];
}

const ENTRY_TYPES: readonly EntryType[] = ['experience', 'education', 'skill', 'certification', 'language', 'interest', 'project', 'volunteer'];
const AFFINITY_TAG_RE = /^(angle|hide):[a-z0-9][a-z0-9-]*$/;

/**
 * Lit le fichier d'affinités : liste JSON de `{ entryType, title, tags }`. Seuls
 * les tags `angle:<slug>` et `hide:<slug>` sont retenus. Les lignes invalides
 * sont ignorées et listées dans `errors`.
 * @throws {SyntaxError} si le texte n'est pas une liste JSON.
 */
export function parseAffinityFile(text: string): { rows: AffinityFileRow[]; errors: string[] } {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new SyntaxError('Le fichier doit contenir une liste JSON.');
  const rows: AffinityFileRow[] = [];
  const errors: string[] = [];
  parsed.forEach((item, i) => {
    const r = (item ?? {}) as Record<string, unknown>;
    const entryType = r.entryType as EntryType;
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    if (!ENTRY_TYPES.includes(entryType) || !title) {
      errors.push(`Ligne ${i + 1} : type ou titre manquant.`);
      return;
    }
    const tags = parseStringArray(r.tags).map(t => t.trim()).filter(t => AFFINITY_TAG_RE.test(t));
    rows.push({ entryType, title, tags });
  });
  return { rows, errors };
}

export interface AffinityUpdate {
  entryId: string;
  entryType: EntryType;
  title: string;
  /** Tags ajoutés (absents de l'entrée). */
  added: string[];
  /** Tags complets après import (existants + ajoutés, sans doublon). */
  tags: string[];
}

export interface AffinityImportPlan {
  /** Entrées du fichier retrouvées dans le profil. */
  matched: number;
  /** Entrées à modifier (au moins un tag ajouté). */
  updates: AffinityUpdate[];
  /** Lignes du fichier sans entrée correspondante. */
  unmatched: AffinityFileRow[];
  addedTagCount: number;
}

/**
 * Plan d'import (récapitulatif avant écriture). Rapprochement par `entryType`
 * et titre exact normalisé ; les tags du fichier sont AJOUTÉS (jamais de
 * suppression, étiquettes existantes conservées, sans doublon).
 */
export function planAffinityImport(rows: readonly AffinityFileRow[], entries: readonly MasterEntry[]): AffinityImportPlan {
  const byKey = new Map<string, MasterEntry>();
  for (const e of entries) {
    const key = `${e.entryType}|${normalizeLabel(e.title)}`;
    if (!byKey.has(key)) byKey.set(key, e);
  }
  const pending = new Map<string, AffinityUpdate>();
  const unmatched: AffinityFileRow[] = [];
  let matched = 0;
  for (const row of rows) {
    const entry = byKey.get(`${row.entryType}|${normalizeLabel(row.title)}`);
    if (!entry) { unmatched.push(row); continue; }
    matched++;
    const current = pending.get(entry.id)?.tags ?? entryTags(entry);
    const added = row.tags.filter(t => !current.includes(t)).filter((t, i, a) => a.indexOf(t) === i);
    if (added.length === 0) continue;
    const prev = pending.get(entry.id);
    pending.set(entry.id, {
      entryId: entry.id,
      entryType: entry.entryType,
      title: entry.title,
      added: [...(prev?.added ?? []), ...added],
      tags: [...current, ...added],
    });
  }
  const updates = [...pending.values()];
  return { matched, updates, unmatched, addedTagCount: updates.reduce((n, u) => n + u.added.length, 0) };
}
