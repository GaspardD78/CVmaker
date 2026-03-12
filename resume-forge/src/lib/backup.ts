/**
 * Backup & Restore — full-data import/export for ResumeForge.
 *
 * Backup file format: JSON with a `.cvmaker` extension.
 * Data is stored in raw snake_case to stay faithful to the SQLite schema.
 */

import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { getDb } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModuleId =
  | 'profile'
  | 'masterEntries'
  | 'cvDocuments'
  | 'applications'
  | 'settings';

export interface ModuleMeta {
  id: ModuleId;
  label: string;
  description: string;
  /** Tables included in this module */
  tables: string[];
}

export const MODULES: ModuleMeta[] = [
  {
    id: 'profile',
    label: 'Profil & coordonnées',
    description: 'Nom, contact, photo, résumé, liens sociaux',
    tables: ['profiles'],
  },
  {
    id: 'masterEntries',
    label: 'Entrées CV',
    description: 'Expériences, formations, compétences, langues, projets…',
    tables: ['master_entries'],
  },
  {
    id: 'cvDocuments',
    label: 'Documents CV',
    description: 'CVs créés, leurs blocs et paramètres de mise en page',
    tables: ['cv_documents', 'cv_blocks'],
  },
  {
    id: 'applications',
    label: 'Candidatures',
    description: 'Candidatures, événements et pièces jointes (métadonnées)',
    tables: ['applications', 'application_events', 'application_attachments'],
  },
  {
    id: 'settings',
    label: 'Paramètres application',
    description: 'Template par défaut, langue, thème',
    tables: ['settings'],
  },
];

export type ImportStrategy = 'replace' | 'merge' | 'ignore';

export interface BackupData {
  __cvmaker_backup: true;
  version: string;
  exportDate: string;
  modules: Partial<Record<string, Record<string, unknown>[]>>;
  /** Record count per module for display */
  counts: Partial<Record<ModuleId, number>>;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportBackup(selectedModules: ModuleId[]): Promise<void> {
  const db = await getDb();
  const modules: BackupData['modules'] = {};
  const counts: BackupData['counts'] = {};

  for (const moduleId of selectedModules) {
    const meta = MODULES.find(m => m.id === moduleId)!;
    let totalRows = 0;
    for (const table of meta.tables) {
      const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${table}`);
      modules[table] = rows;
      totalRows += rows.length;
    }
    counts[moduleId] = totalRows;
  }

  const backup: BackupData = {
    __cvmaker_backup: true,
    version: '1.0',
    exportDate: new Date().toISOString(),
    modules,
    counts,
  };

  const dateSlug = new Date().toISOString().slice(0, 10);
  const savePath = await save({
    defaultPath: `resumeforge_backup_${dateSlug}.cvmaker`,
    filters: [{ name: 'Sauvegarde ResumeForge', extensions: ['cvmaker'] }],
  });

  if (!savePath) return;

  await writeTextFile(savePath, JSON.stringify(backup, null, 2));
}

// ─── Parse / validate a backup file ─────────────────────────────────────────

export async function pickAndParseBackup(): Promise<BackupData | null> {
  const filePath = await open({
    multiple: false,
    filters: [{ name: 'Sauvegarde ResumeForge', extensions: ['cvmaker', 'json'] }],
  });

  if (!filePath || Array.isArray(filePath)) return null;

  const raw = await readTextFile(filePath as string);
  const parsed = JSON.parse(raw) as BackupData;

  if (!parsed.__cvmaker_backup || !parsed.modules) {
    throw new Error('Fichier invalide : ce n\'est pas une sauvegarde ResumeForge.');
  }

  return parsed;
}

/** Returns which module IDs are present in a backup */
export function detectModules(backup: BackupData): ModuleId[] {
  return MODULES.filter(meta =>
    meta.tables.some(t => Array.isArray(backup.modules[t]) && (backup.modules[t]?.length ?? 0) > 0)
  ).map(m => m.id);
}

/** Count of rows per module in the backup */
export function countRows(backup: BackupData, moduleId: ModuleId): number {
  const meta = MODULES.find(m => m.id === moduleId)!;
  return meta.tables.reduce((sum, t) => sum + (backup.modules[t]?.length ?? 0), 0);
}

// ─── Import ───────────────────────────────────────────────────────────────────

export interface ImportPlan {
  profile?: ImportStrategy;
  masterEntries?: ImportStrategy;
  cvDocuments?: ImportStrategy;
  applications?: ImportStrategy;
  settings?: ImportStrategy;
}

/**
 * Inserts rows into a table using the given strategy.
 * - replace: DELETE all then INSERT
 * - merge: INSERT OR REPLACE (upsert by primary key)
 * - ignore: INSERT OR IGNORE (skip existing by primary key)
 */
async function applyRows(
  db: Awaited<ReturnType<typeof getDb>>,
  table: string,
  rows: Record<string, unknown>[],
  strategy: 'replace_insert' | 'merge' | 'ignore',
): Promise<void> {
  if (rows.length === 0) return;

  const keyword = strategy === 'merge' ? 'OR REPLACE' : 'OR IGNORE';
  const columns = Object.keys(rows[0]);
  const colStr = columns.join(', ');

  for (const row of rows) {
    const values = columns.map(c => row[c]);
    const placeholders = columns.map((_, i) => `?${i + 1}`).join(', ');
    await db.execute(`INSERT ${keyword} INTO ${table} (${colStr}) VALUES (${placeholders})`, values);
  }
}

/**
 * Deletion order respects FK constraints (leaves first).
 * Only deletes from tables included in the module.
 */
const DELETE_ORDER: string[] = [
  'application_attachments',
  'application_events',
  'cv_blocks',
  'applications',
  'cv_documents',
  'master_entries',
  'profiles',
  'settings',
];

export async function importBackup(backup: BackupData, plan: ImportPlan): Promise<void> {
  const db = await getDb();

  // Build list of (table, strategy) to process, in safe insert order
  const insertOrder: string[] = [
    'profiles',
    'settings',
    'master_entries',
    'cv_documents',
    'cv_blocks',
    'applications',
    'application_events',
    'application_attachments',
  ];

  // Collect which tables need DELETE (replace strategy)
  const tablesToDelete = new Set<string>();
  for (const [moduleId, strategy] of Object.entries(plan) as [ModuleId, ImportStrategy][]) {
    if (strategy !== 'replace') continue;
    const meta = MODULES.find(m => m.id === moduleId)!;
    meta.tables.forEach(t => tablesToDelete.add(t));
  }

  // Delete in reverse-FK order
  if (tablesToDelete.size > 0) {
    for (const table of DELETE_ORDER) {
      if (tablesToDelete.has(table)) {
        await db.execute(`DELETE FROM ${table}`);
      }
    }
  }

  // Insert in FK-safe order
  for (const table of insertOrder) {
    const rows = backup.modules[table];
    if (!rows || rows.length === 0) continue;

    // Determine which module this table belongs to
    const meta = MODULES.find(m => m.tables.includes(table));
    if (!meta) continue;

    const strategy = plan[meta.id as ModuleId];
    if (!strategy || strategy === 'ignore') {
      // ignore: skip if already exists
      await applyRows(db, table, rows, 'ignore');
    } else if (strategy === 'replace') {
      // Already deleted above, now plain insert
      await applyRows(db, table, rows, 'replace_insert');
    } else {
      // merge: upsert
      await applyRows(db, table, rows, 'merge');
    }
  }
}
