
import { describe, it, expect, mock } from 'bun:test';

// Mock Tauri plugins before importing backup
mock.module('@tauri-apps/plugin-dialog', () => ({
  save: () => {},
  open: () => {}
}));
mock.module('@tauri-apps/plugin-fs', () => ({
  writeTextFile: () => {},
  readTextFile: () => {}
}));
// Base factice remplaçable par test (défaut : objet vide, comme avant).
let fakeDb: any = {};
mock.module('@/lib/db', () => ({
  getDb: () => fakeDb
}));
let currentUserId: string | null = null;
mock.module('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ currentUserId }) }
}));

// Mock validation
mock.module('./validation', () => ({
  filterAllowedColumns: (_table: string, data: any) => data
}));

// Now import applyRows
import { applyRows, buildBackupData, importBackup, remapBackupProfileId, DELETE_ORDER, INSERT_ORDER, MODULES, TABLES_WITH_PROFILE_ID, type BackupData } from './backup';

describe('applyRows logic', () => {
  it('should construct correct multi-value INSERT queries with chunking', async () => {
    const capturedQueries: string[] = [];
    const capturedValues: any[][] = [];

    const db = {
      execute: async (query: string, values: any[]) => {
        capturedQueries.push(query);
        capturedValues.push(values);
      }
    } as any;

    // Create 40 rows. With BATCH_SIZE = 30, it should result in 2 queries (30 rows + 10 rows)
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` }));

    await applyRows(db, 'users', rows, 'merge');

    expect(capturedQueries.length).toBe(2);

    // First query: 30 rows
    expect(capturedQueries[0]).toContain('INSERT OR REPLACE INTO users (id, name) VALUES');
    expect(capturedValues[0].length).toBe(60); // 30 rows * 2 columns
    expect(capturedValues[0][0]).toBe(1);
    expect(capturedValues[0][1]).toBe('User 1');
    expect(capturedValues[0][58]).toBe(30);
    expect(capturedValues[0][59]).toBe('User 30');

    // Second query: 10 rows
    expect(capturedQueries[1]).toContain('INSERT OR REPLACE INTO users (id, name) VALUES');
    expect(capturedValues[1].length).toBe(20); // 10 rows * 2 columns
    expect(capturedValues[1][0]).toBe(31);
    expect(capturedValues[1][1]).toBe('User 31');
    expect(capturedValues[1][18]).toBe(40);
    expect(capturedValues[1][19]).toBe('User 40');
  });

  it('should handle single row', async () => {
    const capturedQueries: string[] = [];
    const capturedValues: any[][] = [];

    const db = {
      execute: async (query: string, values: any[]) => {
        capturedQueries.push(query);
        capturedValues.push(values);
      }
    } as any;

    const rows = [
      { id: 1, name: 'Alice' }
    ];

    await applyRows(db, 'users', rows, 'ignore');

    expect(capturedQueries.length).toBe(1);
    expect(capturedQueries[0]).toBe('INSERT OR IGNORE INTO users (id, name) VALUES (?1, ?2)');
    expect(capturedValues[0]).toEqual([1, 'Alice']);
  });
});

describe('sauvegarde des angles de CV (cv_angles)', () => {
  const angleRow = { id: 'a1', profile_id: 'old', slug: 'angle-x', label: 'Angle fictif', title_rule: 'profile', skill_category_order: '["A"]' };
  const entryRow = { id: 'e1', profile_id: 'old', entry_type: 'skill', title: 'A', tags: '["angle:angle-x"]' };

  it('rangée dans le module « Entrées CV », ordonnée après master_entries', () => {
    expect(MODULES.find(m => m.id === 'masterEntries')!.tables).toContain('cv_angles');
    expect(INSERT_ORDER.indexOf('cv_angles')).toBeGreaterThan(INSERT_ORDER.indexOf('master_entries'));
    expect(DELETE_ORDER.indexOf('cv_angles')).toBeLessThan(DELETE_ORDER.indexOf('profiles'));
    expect(TABLES_WITH_PROFILE_ID).toContain('cv_angles');
  });

  it('remappage du profil appliqué aux angles', () => {
    const backup = { __cvmaker_backup: true, version: '1.0', exportDate: '', counts: {}, modules: {
      profiles: [{ id: 'old' }], cv_angles: [{ ...angleRow }], master_entries: [{ ...entryRow }],
    } } as BackupData;
    remapBackupProfileId(backup, 'new');
    expect(backup.modules.cv_angles![0].profile_id).toBe('new');
    expect(backup.modules.master_entries![0].profile_id).toBe('new');
  });

  it('export puis restauration : les angles sont conservés, sur le profil courant', async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      profiles: [{ id: 'old' }], master_entries: [entryRow], cv_angles: [angleRow],
    };
    const executed: { query: string; values: unknown[] }[] = [];
    fakeDb = {
      select: async (query: string) => tables[/FROM (\w+)/.exec(query)![1]] ?? [],
      execute: async (query: string, values: unknown[] = []) => { executed.push({ query, values }); },
    };
    const backup = await buildBackupData(['profile', 'masterEntries']);
    expect(backup.modules.cv_angles).toEqual([angleRow]);
    expect(backup.counts.masterEntries).toBe(2);

    currentUserId = 'new';
    await importBackup(JSON.parse(JSON.stringify(backup)), { profile: 'merge', masterEntries: 'replace' });
    const del = executed.find(e => e.query.startsWith('DELETE FROM cv_angles'));
    expect(del).toEqual({ query: 'DELETE FROM cv_angles WHERE profile_id = ?1', values: ['new'] });
    const insert = executed.find(e => e.query.startsWith('INSERT OR IGNORE INTO cv_angles'));
    expect(insert).toBeDefined();
    expect(insert!.values).toContain('angle-x');
    expect(insert!.values).toContain('new');
    expect(insert!.values).not.toContain('old');
    const order = executed.map(e => e.query).filter(q => q.startsWith('INSERT'));
    expect(order.findIndex(q => q.includes('cv_angles'))).toBeGreaterThan(order.findIndex(q => q.includes('master_entries')));
    fakeDb = {};
    currentUserId = null;
  });
});
