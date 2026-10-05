import type { SqlPort } from '../cv-angle-repo';

/**
 * Base en mémoire pour `cv_angles`, limitée aux requêtes de `createAngleRepo`
 * (SELECT par profil, INSERT OR IGNORE, UPDATE par id, DELETE par id).
 */
export function makeFakeAngleDb(): SqlPort & { rows: Record<string, unknown>[]; inserts: number } {
  let seq = 0;
  const state = {
    rows: [] as Record<string, unknown>[],
    inserts: 0,
    async select<T>(query: string, values: unknown[] = []): Promise<T> {
      if (!query.startsWith('SELECT * FROM cv_angles WHERE profile_id = ?1')) throw new Error(`requête inattendue : ${query}`);
      const rows = state.rows
        .filter(r => r.profile_id === values[0])
        .sort((a, b) => (a.sort_order as number) - (b.sort_order as number));
      return rows.map(r => ({ ...r })) as T;
    },
    async execute(query: string, values: unknown[] = []): Promise<unknown> {
      const insert = /^INSERT OR IGNORE INTO cv_angles \(([^)]+)\)/.exec(query);
      if (insert) {
        const row: Record<string, unknown> = {};
        insert[1].split(', ').forEach((k, i) => { row[k] = values[i]; });
        if (state.rows.some(r => r.profile_id === row.profile_id && r.slug === row.slug)) return; // UNIQUE (profile_id, slug)
        state.inserts++;
        state.rows.push({ id: `a${++seq}`, created_at: `2026-01-0${seq}`, updated_at: '', ...row });
        return;
      }
      const update = /^UPDATE cv_angles SET (.+), updated_at = datetime\('now'\) WHERE id = \?(\d+)$/.exec(query);
      if (update) {
        const row = state.rows.find(r => r.id === values[Number(update[2]) - 1]);
        update[1].split(', ').forEach((part, i) => { if (row) row[part.split(' = ')[0]] = values[i]; });
        return;
      }
      if (query.startsWith('DELETE FROM cv_angles WHERE id = ?1')) {
        state.rows = state.rows.filter(r => r.id !== values[0]);
        return;
      }
      throw new Error(`requête inattendue : ${query}`);
    },
  };
  return state;
}
