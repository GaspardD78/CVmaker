/**
 * Lignes d'un groupe « badges » (compétences, langues, centres d'intérêt,
 * certifications), partagées par le rendu écran/PDF (`CVBadgeGroup`) et
 * l'export DOCX pour que les deux ne divergent plus.
 *
 * Convention de données : une entrée `skill` dont la description contient des
 * puces (`- x`) est une CATÉGORIE. Son `title` est le libellé de la catégorie,
 * chaque puce un élément. La surcharge `description` d'un bloc (`overrideData`)
 * permet de ne garder que certains éléments pour un CV donné : une catégorie
 * dont tous les éléments ont été retirés n'est pas rendue.
 *
 * Les autres entrées (compétence isolée, langue, centre d'intérêt,
 * certification) sont des éléments « libres », regroupés sur une dernière
 * ligne sans libellé.
 */
import type { EntryType, MasterEntry } from '@/types/profile';

/** Types d'entrées rendus en badges (groupe de libellés) plutôt qu'en bloc d'entrée. */
export const BADGE_ENTRY_TYPES: readonly EntryType[] = ['skill', 'language', 'interest', 'certification'];

/** Bloc minimal nécessaire au calcul des lignes. */
export interface BadgeBlockLike {
  entryId: string | null;
  overrideData?: Record<string, unknown> | null;
}

/** Un élément de ligne : libellé et, pour le format tableau, niveau (sous-titre). */
export interface BadgeItem {
  name: string;
  level?: string;
}

/** Une ligne : une catégorie (`category` renseigné) ou les éléments libres (`category: null`). */
export interface BadgeRow {
  category: string | null;
  items: BadgeItem[];
}

/** Séparateur des éléments d'une catégorie sur une ligne. */
export const SKILL_ITEM_SEPARATOR = ' · ';

const BULLET_RE = /^[-*]\s+/;

/** Puces (`- x` ou `* x`) d'une description, sans le marqueur ; `[]` s'il n'y en a pas. */
export function bulletItems(description: string | null | undefined): string[] {
  return (description ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => BULLET_RE.test(l))
    .map(l => l.replace(BULLET_RE, '').trim())
    .filter(Boolean);
}

/** `true` pour une entrée `skill` de type catégorie (description à puces dans la source). */
export function isSkillCategory(entry: Pick<MasterEntry, 'entryType' | 'description'>): boolean {
  return entry.entryType === 'skill' && bulletItems(entry.description).length > 0;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Élément libre d'une entrée badge. La description ne remplace le titre que pour
 * une compétence ; une langue, un centre d'intérêt ou une certification
 * affichent leur titre, et le sous-titre (niveau, émetteur) en `level`.
 */
function looseItem(entry: MasterEntry, data: Record<string, unknown>): BadgeItem | null {
  const title = str(data.title);
  const subtitle = str(data.subtitle);
  if (entry.entryType === 'skill') {
    const description = str(data.description);
    if (description) return { name: description };
  }
  if (!title) return null;
  return subtitle ? { name: title, level: subtitle } : { name: title };
}

/**
 * Lignes d'un groupe de badges, dans l'ordre des blocs (donc de `entryOrder`) :
 * une ligne par catégorie non vide, puis une dernière ligne sans libellé pour
 * les éléments libres. Les blocs reçus sont supposés visibles.
 */
export function buildBadgeRows(blocks: readonly BadgeBlockLike[], entries: readonly MasterEntry[]): BadgeRow[] {
  const byId = new Map(entries.map(e => [e.id, e] as const));
  const rows: BadgeRow[] = [];
  const loose: BadgeItem[] = [];
  for (const block of blocks) {
    const entry = block.entryId ? byId.get(block.entryId) : undefined;
    if (!entry) continue;
    const data: Record<string, unknown> = { ...entry, ...(block.overrideData ?? {}) };
    if (entry.entryType === 'skill') {
      const items = bulletItems(typeof data.description === 'string' ? data.description : null);
      // Catégorie dans la source ou dans la surcharge : une ligne (omise si vidée par la surcharge).
      if (items.length > 0 || isSkillCategory(entry)) {
        const category = str(data.title);
        if (items.length > 0) rows.push({ category: category || null, items: items.map(name => ({ name })) });
        continue;
      }
    }
    const item = looseItem(entry, data);
    if (item) loose.push(item);
  }
  if (loose.length > 0) rows.push({ category: null, items: loose });
  return rows;
}

/** Libellé affiché d'un élément libre hors format tableau (« titre - niveau »). */
export function itemLabel(item: BadgeItem): string {
  return item.level ? `${item.name} - ${item.level}` : item.name;
}

/** `true` quand au moins une ligne porte un libellé de catégorie. */
export function hasCategories(rows: readonly BadgeRow[]): boolean {
  return rows.some(r => r.category !== null);
}

/**
 * Texte brut d'une ligne : `Catégorie : a · b · c`, ou les éléments seuls pour
 * la ligne sans libellé. Utilisé par les formats en ligne (badges, virgules) et
 * les tests ; le rendu met le libellé en gras.
 */
export function rowText(row: BadgeRow): string {
  const items = row.items.map(itemLabel).join(SKILL_ITEM_SEPARATOR);
  return row.category ? `${row.category} : ${items}` : items;
}
