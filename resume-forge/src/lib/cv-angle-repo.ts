/**
 * Accès à la table `cv_angles` (migration 020). La base est injectée pour que
 * la logique (plafond, valeurs de départ, slugs) se teste sans Tauri ; le store
 * `angleStore` l'utilise avec `getDb()`.
 */
import {
  DEFAULT_ANGLES, MAX_ANGLES_PER_PROFILE, fieldsToRow, rowToAngle, uniqueSlug,
  type CvAngle, type CvAngleFields,
} from './cv-angles';
import { filterAllowedColumns } from './validation';

/** Sous-ensemble de `@tauri-apps/plugin-sql` utilisé ici. */
export interface SqlPort {
  select<T>(query: string, values?: unknown[]): Promise<T>;
  execute(query: string, values?: unknown[]): Promise<unknown>;
}

export class AngleLimitError extends Error {
  constructor() {
    super(`Plafond atteint : ${MAX_ANGLES_PER_PROFILE} angles par profil. Supprimez ou remplacez un angle existant.`);
    this.name = 'AngleLimitError';
  }
}

export function createAngleRepo(getDb: () => Promise<SqlPort>) {
  const list = async (profileId: string): Promise<CvAngle[]> => {
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM cv_angles WHERE profile_id = ?1 ORDER BY sort_order ASC, created_at ASC',
      [profileId],
    );
    return rows.map(rowToAngle);
  };

  const insert = async (db: SqlPort, profileId: string, fields: CvAngleFields, sortOrder: number): Promise<void> => {
    const row = filterAllowedColumns('cv_angles', { profile_id: profileId, sort_order: sortOrder, ...fieldsToRow(fields) });
    const keys = Object.keys(row);
    await db.execute(
      `INSERT OR IGNORE INTO cv_angles (${keys.join(', ')}) VALUES (${keys.map((_, i) => `?${i + 1}`).join(', ')})`,
      Object.values(row),
    );
  };

  return {
    list,

    /**
     * Angles du profil ; crée les angles de départ SEULEMENT si le profil n'en
     * a aucun (jamais d'écrasement des modifications).
     */
    async listWithDefaults(profileId: string): Promise<CvAngle[]> {
      const existing = await list(profileId);
      if (existing.length > 0) return existing;
      const db = await getDb();
      for (const [i, fields] of DEFAULT_ANGLES.entries()) await insert(db, profileId, fields, i);
      return list(profileId);
    },

    /** Crée un angle (slug unique dérivé du libellé si absent ou pris). Plafond : `AngleLimitError`. */
    async create(profileId: string, fields: Omit<CvAngleFields, 'slug'> & { slug?: string }): Promise<CvAngle[]> {
      const existing = await list(profileId);
      if (existing.length >= MAX_ANGLES_PER_PROFILE) throw new AngleLimitError();
      const taken = existing.map(a => a.slug);
      const slug = fields.slug && !taken.includes(fields.slug) ? fields.slug : uniqueSlug(fields.slug || fields.label, taken);
      const sortOrder = existing.reduce((m, a) => Math.max(m, a.sortOrder + 1), 0);
      await insert(await getDb(), profileId, { ...fields, slug }, sortOrder);
      return list(profileId);
    },

    /** Met à jour les champs éditables (le slug, référencé par les tags, ne change pas). */
    async update(id: string, fields: Partial<Omit<CvAngleFields, 'slug'>>): Promise<void> {
      const row = filterAllowedColumns('cv_angles', fieldsToRow(fields));
      const keys = Object.keys(row);
      if (keys.length === 0) return;
      const db = await getDb();
      await db.execute(
        `UPDATE cv_angles SET ${keys.map((k, i) => `${k} = ?${i + 1}`).join(', ')}, updated_at = datetime('now') WHERE id = ?${keys.length + 1}`,
        [...Object.values(row), id],
      );
    },

    async remove(id: string): Promise<void> {
      const db = await getDb();
      await db.execute('DELETE FROM cv_angles WHERE id = ?1', [id]);
    },
  };
}

export type AngleRepo = ReturnType<typeof createAngleRepo>;
