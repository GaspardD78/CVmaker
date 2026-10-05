/**
 * Backup & Restore — full-data import/export for ResumeForge.
 *
 * Backup file format: JSON with a `.cvmaker` extension.
 * Data is stored in raw snake_case to stay faithful to the SQLite schema.
 */

import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { getDb } from '@/lib/db';
import { filterAllowedColumns } from './validation';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModuleId =
  | 'profile'
  | 'masterEntries'
  | 'cvDocuments'
  | 'applications'
  | 'settings'
  | 'jobWatch';

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
    description: 'Expériences, formations, compétences, langues, projets, angles de CV…',
    tables: ['master_entries', 'cv_angles'],
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
  {
    id: 'jobWatch',
    label: 'Veille emploi',
    description: 'Recherches enregistrées, paramètres de veille et offres sauvegardées',
    tables: [
      'job_watch_config',
      'job_watch_settings',
      'job_offers',
      'job_watch_fetch_log',
      'job_offer_feedback',
    ],
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

/** Collect backup data for the given modules without saving to a file. */
export async function buildBackupData(selectedModules: ModuleId[]): Promise<BackupData> {
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

  return {
    __cvmaker_backup: true,
    version: '1.0',
    exportDate: new Date().toISOString(),
    modules,
    counts,
  };
}

export async function exportBackup(selectedModules: ModuleId[]): Promise<void> {
  const backup = await buildBackupData(selectedModules);

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
  jobWatch?: ImportStrategy;
}

/**
 * Inserts rows into a table using the given strategy.
 * - replace: DELETE all then INSERT
 * - merge: INSERT OR REPLACE (upsert by primary key)
 * - ignore: INSERT OR IGNORE (skip existing by primary key)
 */
export async function applyRows(
  db: Awaited<ReturnType<typeof getDb>>,
  table: string,
  rows: Record<string, unknown>[],
  strategy: 'replace_insert' | 'merge' | 'ignore',
): Promise<void> {
  if (rows.length === 0) return;

  const keyword = strategy === 'merge' ? 'OR REPLACE' : 'OR IGNORE';

  // Validate and filter columns based on the first row to ensure they're all allowed.
  // This prevents SQL injection from malicious backup files while maintaining schema compatibility.
  const filteredFirstRow = filterAllowedColumns(table, rows[0]);
  const columns = Object.keys(filteredFirstRow);
  if (columns.length === 0) return;

  const colStr = columns.join(', ');

  // SQLite has a limit on the number of parameters (?1, ?2) in a single query (often 999).
  // We chunk the insertions to stay safe.
  const BATCH_SIZE = 30; // 30 rows * ~15-20 columns < 999

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const allPlaceholders: string[] = [];
    const allValues: unknown[] = [];

    for (let rowIndex = 0; rowIndex < chunk.length; rowIndex++) {
      const row = chunk[rowIndex];
      // Parameter indices must be global for the current query (1 to chunk.length * columns.length)
      const rowPlaceholders = columns.map((_, colIndex) =>
        `?${rowIndex * columns.length + colIndex + 1}`
      ).join(', ');
      allPlaceholders.push(`(${rowPlaceholders})`);

      for (const col of columns) {
        allValues.push(row[col]);
      }
    }

    const query = `INSERT ${keyword} INTO ${table} (${colStr}) VALUES ${allPlaceholders.join(', ')}`;
    await db.execute(query, allValues);
  }
}

/**
 * Deletion order respects FK constraints (leaves first).
 * Only deletes from tables included in the module.
 */
export const DELETE_ORDER: string[] = [
  'job_offer_feedback',
  'application_attachments',
  'application_events',
  'job_offers',
  'cv_blocks',
  'applications',
  'cv_documents',
  'cv_angles',
  'master_entries',
  'job_watch_config',
  'job_watch_fetch_log',
  'job_watch_settings',
  'profiles',
  'settings',
];

/** Tables portant un `profile_id` (remappage du profil, suppression limitée au profil courant). */
export const TABLES_WITH_PROFILE_ID: string[] = [
  'master_entries',
  'cv_angles',
  'cv_documents',
  'applications',
  'job_watch_config',
  'job_offers',
  'job_watch_settings',
];

/** Ordre d'insertion compatible avec les clés étrangères. */
export const INSERT_ORDER: string[] = [
  'profiles',
  'settings',
  'job_watch_settings',
  'job_watch_config',
  'master_entries',
  'cv_angles',
  'cv_documents',
  'cv_blocks',
  'applications',
  'application_events',
  'application_attachments',
  'job_offers',
  'job_offer_feedback',
  'job_watch_fetch_log',
];

/** Un profil présent dans une sauvegarde (choix du profil à restaurer). */
export interface BackupProfile {
  id: string;
  /** Prénom et nom, ou l'identifiant si le profil n'a pas de ligne `profiles`. */
  label: string;
}

/** La sauvegarde contient plusieurs profils et aucun n'est celui de l'utilisateur actif : il faut choisir. */
export class BackupProfileChoiceRequired extends Error {
  constructor(public readonly profiles: BackupProfile[]) {
    super(`La sauvegarde contient ${profiles.length} profils : choisissez celui à restaurer.`);
    this.name = 'BackupProfileChoiceRequired';
  }
}

const isScopedId = (v: unknown): v is string => typeof v === 'string' && v !== '';

/**
 * Profils présents dans la sauvegarde : lignes `profiles`, plus tout
 * `profile_id` non vide des autres tables (un export partiel sans le module
 * Profil peut contenir les données de plusieurs profils).
 */
export function listBackupProfiles(backup: BackupData): BackupProfile[] {
  const out = new Map<string, BackupProfile>();
  for (const row of backup.modules['profiles'] ?? []) {
    if (!isScopedId(row.id)) continue;
    const name = [row.first_name, row.last_name].filter(v => typeof v === 'string' && v.trim()).join(' ');
    out.set(row.id, { id: row.id, label: name || row.id });
  }
  for (const table of TABLES_WITH_PROFILE_ID) {
    for (const row of backup.modules[table] ?? []) {
      if (isScopedId(row.profile_id) && !out.has(row.profile_id)) out.set(row.profile_id, { id: row.profile_id, label: row.profile_id });
    }
  }
  return [...out.values()];
}

/**
 * Profil de la sauvegarde à restaurer : celui choisi par l'utilisateur, sinon
 * celui de l'utilisateur actif, sinon l'unique profil présent. Jamais « le
 * premier » par défaut : plusieurs profils sans correspondance lèvent
 * `BackupProfileChoiceRequired`. `null` quand la sauvegarde ne porte aucun profil.
 */
export function resolveSourceProfileId(
  backup: BackupData,
  currentUserId: string | null | undefined,
  chosen?: string | null,
): string | null {
  const profiles = listBackupProfiles(backup);
  if (chosen) {
    if (!profiles.some(p => p.id === chosen)) throw new Error('Profil choisi absent de la sauvegarde.');
    return chosen;
  }
  if (profiles.length === 0) return null;
  if (currentUserId && profiles.some(p => p.id === currentUserId)) return currentUserId;
  if (profiles.length === 1) return profiles[0].id;
  throw new BackupProfileChoiceRequired(profiles);
}

/**
 * Présélection du profil à restaurer dans l'écran d'import : celui de
 * l'utilisateur actif, sinon l'unique profil ; chaîne vide quand il faut
 * choisir (jamais le premier par défaut).
 */
export function defaultSourceProfileId(profiles: readonly BackupProfile[], currentUserId: string | null | undefined): string {
  if (currentUserId && profiles.some(p => p.id === currentUserId)) return currentUserId;
  return profiles.length === 1 ? profiles[0].id : '';
}

/** Préfixe des réglages propres à un profil dans la table globale `settings` (clé `<préfixe><profileId>`). */
const PROFILE_SETTING_PREFIXES = ['cv_personal_rules:'];

/**
 * Sauvegarde réduite au profil `sourceId`, remappé sur `targetId` (copie, la
 * sauvegarde d'origine n'est pas modifiée) :
 * - `profiles` et tables à `profile_id` : lignes du profil source seulement
 *   (les lignes globales, `profile_id` vide ou absent, sont conservées) ;
 * - tables filles filtrées par leur parent (blocs par CV, événements et
 *   pièces jointes par candidature, retours par offre) ;
 * - réglages par profil (`cv_personal_rules:<id>`) : ceux du profil source,
 *   renommés pour le profil cible ; ceux des autres profils sont écartés.
 */
export function selectBackupProfile(backup: BackupData, sourceId: string, targetId: string): BackupData {
  const modules: BackupData['modules'] = {};
  const copy = (rows: Record<string, unknown>[] | undefined) => rows?.map(r => ({ ...r }));
  for (const [table, rows] of Object.entries(backup.modules)) modules[table] = copy(rows);

  const ownedBySource = (row: Record<string, unknown>) => !isScopedId(row.profile_id) || row.profile_id === sourceId;
  if (modules['profiles']) modules['profiles'] = modules['profiles'].filter(r => r.id === sourceId);
  for (const table of TABLES_WITH_PROFILE_ID) {
    if (modules[table]) modules[table] = modules[table]!.filter(ownedBySource);
  }

  const ids = (table: string) => new Set((modules[table] ?? []).map(r => r.id));
  const keepChildren = (table: string, parentTable: string, fk: string) => {
    if (!modules[table] || !modules[parentTable]) return;
    const parents = ids(parentTable);
    modules[table] = modules[table]!.filter(r => parents.has(r[fk]));
  };
  keepChildren('cv_blocks', 'cv_documents', 'cv_id');
  keepChildren('application_events', 'applications', 'application_id');
  keepChildren('application_attachments', 'applications', 'application_id');
  keepChildren('job_offer_feedback', 'job_offers', 'offer_id');

  if (modules['settings']) {
    modules['settings'] = modules['settings'].flatMap(row => {
      const key = typeof row.key === 'string' ? row.key : '';
      const prefix = PROFILE_SETTING_PREFIXES.find(p => key.startsWith(p));
      if (!prefix) return [row];
      if (key !== `${prefix}${sourceId}`) return [];
      return [{ ...row, key: `${prefix}${targetId}` }];
    });
  }

  if (sourceId !== targetId) {
    for (const row of modules['profiles'] ?? []) row.id = targetId;
    for (const table of TABLES_WITH_PROFILE_ID) {
      for (const row of modules[table] ?? []) if (row.profile_id === sourceId) row.profile_id = targetId;
    }
  }
  return { ...backup, modules };
}

export interface ImportOptions {
  /** Profil de la sauvegarde à restaurer, quand elle en contient plusieurs (choix de l'utilisateur). */
  sourceProfileId?: string | null;
}

export async function importBackup(backup: BackupData, plan: ImportPlan, opts: ImportOptions = {}): Promise<void> {
  const db = await getDb();

  // ── Profil à restaurer ─────────────────────────────────────────────────
  // La sauvegarde peut venir d'un autre profil, ou d'une base multi-profils :
  // on ne garde que le profil voulu (jamais « le premier » par défaut) et on
  // le remappe sur le profil actif.
  const { useAuthStore } = await import('@/stores/authStore');
  const currentUserId = useAuthStore.getState().currentUserId;
  if (currentUserId) {
    const sourceId = resolveSourceProfileId(backup, currentUserId, opts.sourceProfileId);
    if (sourceId) backup = selectBackupProfile(backup, sourceId, currentUserId);
  }

  // Build list of (table, strategy) to process, in safe insert order
  const insertOrder: string[] = INSERT_ORDER;

  // Collect which tables need DELETE (replace strategy)
  const tablesToDelete = new Set<string>();
  for (const [moduleId, strategy] of Object.entries(plan) as [ModuleId, ImportStrategy][]) {
    if (strategy !== 'replace') continue;
    const meta = MODULES.find(m => m.id === moduleId)!;
    meta.tables.forEach(t => tablesToDelete.add(t));
  }

  // Delete in reverse-FK order, scoped to the current profile where applicable
  if (tablesToDelete.size > 0) {
    for (const table of DELETE_ORDER) {
      if (!tablesToDelete.has(table)) continue;

      if (currentUserId && table === 'profiles') {
        await db.execute('DELETE FROM profiles WHERE id = ?1', [currentUserId]);
      } else if (currentUserId && TABLES_WITH_PROFILE_ID.includes(table)) {
        await db.execute(`DELETE FROM ${table} WHERE profile_id = ?1`, [currentUserId]);
      } else {
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
