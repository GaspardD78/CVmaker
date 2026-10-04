
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
import {
  applyRows, buildBackupData, importBackup, listBackupProfiles, resolveSourceProfileId, selectBackupProfile,
  BackupProfileChoiceRequired, DELETE_ORDER, INSERT_ORDER, MODULES, TABLES_WITH_PROFILE_ID, type BackupData,
} from './backup';

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
    const out = selectBackupProfile(backup, resolveSourceProfileId(backup, 'new')!, 'new');
    expect(out.modules.cv_angles![0].profile_id).toBe('new');
    expect(out.modules.master_entries![0].profile_id).toBe('new');
    expect(backup.modules.cv_angles![0].profile_id).toBe('old'); // copie : l'original n'est pas modifié
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

describe('sauvegarde à plusieurs profils', () => {
  // Deux profils fictifs ; « p-autre » est volontairement le PREMIER de la sauvegarde.
  const twoProfiles = (): BackupData => ({
    __cvmaker_backup: true, version: '1.0', exportDate: '', counts: {},
    modules: {
      profiles: [
        { id: 'p-autre', first_name: 'Alex', last_name: 'Fictif' },
        { id: 'p-actif', first_name: 'Sam', last_name: 'Exemple' },
      ],
      master_entries: [
        { id: 'e-autre', profile_id: 'p-autre', entry_type: 'skill', title: 'Compétence A' },
        { id: 'e-actif', profile_id: 'p-actif', entry_type: 'skill', title: 'Compétence B' },
      ],
      cv_angles: [
        { id: 'a-autre', profile_id: 'p-autre', slug: 'x', label: 'Angle A' },
        { id: 'a-actif', profile_id: 'p-actif', slug: 'y', label: 'Angle B' },
      ],
      cv_documents: [
        { id: 'cv-autre', profile_id: 'p-autre', name: 'CV A' },
        { id: 'cv-actif', profile_id: 'p-actif', name: 'CV B' },
      ],
      cv_blocks: [
        { id: 'b-autre', cv_id: 'cv-autre', block_type: 'entry_ref', entry_id: 'e-autre' },
        { id: 'b-actif', cv_id: 'cv-actif', block_type: 'entry_ref', entry_id: 'e-actif' },
      ],
      applications: [{ id: 'app-autre', profile_id: 'p-autre', company_name: 'Société A' }],
      application_events: [{ id: 'ev-autre', application_id: 'app-autre', event_type: 'note' }],
      job_watch_settings: [
        { key: 'cle_globale', profile_id: '', value: '1' },
        { key: 'cle_profil', profile_id: 'p-autre', value: '2' },
      ],
      settings: [
        { key: 'theme', value: 'dark' },
        { key: 'cv_personal_rules:p-autre', value: 'Règles A' },
        { key: 'cv_personal_rules:p-actif', value: 'Règles B' },
      ],
    },
  });

  it('liste les profils de la sauvegarde', () => {
    expect(listBackupProfiles(twoProfiles())).toEqual([
      { id: 'p-autre', label: 'Alex Fictif' },
      { id: 'p-actif', label: 'Sam Exemple' },
    ]);
  });

  it('profil actif présent : c\'est lui qui est restauré, jamais le premier', () => {
    expect(resolveSourceProfileId(twoProfiles(), 'p-actif')).toBe('p-actif');
    const out = selectBackupProfile(twoProfiles(), 'p-actif', 'p-actif');
    expect(out.modules.profiles!.map(r => r.id)).toEqual(['p-actif']);
    expect(out.modules.master_entries!.map(r => r.id)).toEqual(['e-actif']);
    expect(out.modules.cv_angles!.map(r => r.id)).toEqual(['a-actif']);
    expect(out.modules.cv_documents!.map(r => r.id)).toEqual(['cv-actif']);
    expect(out.modules.cv_blocks!.map(r => r.id)).toEqual(['b-actif']);
    expect(out.modules.applications).toEqual([]);
    expect(out.modules.application_events).toEqual([]);
    // Réglages globaux conservés ; réglages par profil : seulement ceux du profil restauré.
    expect(out.modules.job_watch_settings!.map(r => r.key)).toEqual(['cle_globale']);
    expect(out.modules.settings!.map(r => r.key)).toEqual(['theme', 'cv_personal_rules:p-actif']);
  });

  it('aucun profil ne correspond à l\'utilisateur actif : choix obligatoire', () => {
    let err: unknown;
    try { resolveSourceProfileId(twoProfiles(), 'p-inconnu'); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(BackupProfileChoiceRequired);
    expect((err as BackupProfileChoiceRequired).profiles.map(p => p.id)).toEqual(['p-autre', 'p-actif']);
  });

  it('profil choisi par l\'utilisateur : restauré et remappé sur le profil actif', () => {
    const backup = twoProfiles();
    const source = resolveSourceProfileId(backup, 'p-nouveau', 'p-autre');
    expect(source).toBe('p-autre');
    const out = selectBackupProfile(backup, source!, 'p-nouveau');
    expect(out.modules.profiles).toEqual([{ id: 'p-nouveau', first_name: 'Alex', last_name: 'Fictif' }]);
    expect(out.modules.master_entries).toEqual([{ id: 'e-autre', profile_id: 'p-nouveau', entry_type: 'skill', title: 'Compétence A' }]);
    expect(out.modules.application_events!.map(r => r.id)).toEqual(['ev-autre']);
    expect(out.modules.job_watch_settings!.map(r => [r.key, r.profile_id])).toEqual([['cle_globale', ''], ['cle_profil', 'p-nouveau']]);
    expect(out.modules.settings!.map(r => r.key)).toEqual(['theme', 'cv_personal_rules:p-nouveau']);
    expect(() => resolveSourceProfileId(backup, 'p-nouveau', 'absent')).toThrow('absent de la sauvegarde');
  });

  it('un seul profil : restauré même si son id diffère', () => {
    const backup = twoProfiles();
    backup.modules.profiles = [backup.modules.profiles![0]];
    backup.modules.master_entries = [backup.modules.master_entries![0]];
    for (const t of ['cv_angles', 'cv_documents', 'applications', 'job_watch_settings']) {
      backup.modules[t] = backup.modules[t]!.filter(r => r.profile_id !== 'p-actif');
    }
    expect(resolveSourceProfileId(backup, 'p-nouveau')).toBe('p-autre');
  });

  it('importBackup : n\'insère que le profil de l\'utilisateur actif', async () => {
    const executed: { query: string; values: unknown[] }[] = [];
    fakeDb = { execute: async (query: string, values: unknown[] = []) => { executed.push({ query, values }); } };
    currentUserId = 'p-actif';
    await importBackup(twoProfiles(), { profile: 'merge', masterEntries: 'merge', cvDocuments: 'merge', applications: 'merge', settings: 'merge', jobWatch: 'merge' });
    const values = executed.flatMap(e => e.values);
    expect(values).toContain('e-actif');
    expect(values).not.toContain('e-autre');
    expect(values).not.toContain('p-autre');
    expect(values).not.toContain('Règles A');
    expect(executed.some(e => e.query.includes('INTO applications'))).toBe(false);

    // Sans correspondance ni choix : rien n'est écrit.
    executed.length = 0;
    currentUserId = 'p-inconnu';
    await expect(importBackup(twoProfiles(), { masterEntries: 'merge' })).rejects.toBeInstanceOf(BackupProfileChoiceRequired);
    expect(executed).toHaveLength(0);

    // Avec un choix explicite : importé et remappé.
    await importBackup(twoProfiles(), { masterEntries: 'merge' }, { sourceProfileId: 'p-autre' });
    const insert = executed.find(e => e.query.includes('INTO master_entries'))!;
    expect(insert.values).toContain('e-autre');
    expect(insert.values).toContain('p-inconnu');
    expect(insert.values).not.toContain('e-actif');
    fakeDb = {};
    currentUserId = null;
  });
});
