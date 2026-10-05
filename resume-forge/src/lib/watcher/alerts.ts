/**
 * Alertes de veille — les « pistes » du portefeuille de recherche.
 *
 * Une alerte est un profil de recherche complet et autonome : ce qu'on cherche,
 * comment on l'affine, et ce que la piste a appris des actions de l'utilisateur.
 * Ces données vivaient auparavant sous forme de clés globales dans
 * `job_watch_settings` ; les isoler par piste est ce qui permet de mener
 * plusieurs explorations en parallèle sans que la piste dominante n'impose ses
 * pondérations aux autres.
 *
 * Ce module regroupe le CRUD et les invariants du portefeuille. La logique de
 * décision est extraite en fonctions pures (testables sans base) ; les
 * fonctions asynchrones ne font que traduire ces décisions en SQL.
 */

import { getDb } from '@/lib/db';
import {
  ALERT_KIND_COLORS,
  DEFAULT_SEARCH_PROFILE,
  MAX_ALERTS,
  type AlertKind,
  type JobSource,
  type JobWatchAlert,
  type OfferAlertLink,
  type SearchProfile,
} from '@/types/job-watch';
import { SCORER_VERSION } from './scorer';
import type { AIFilterRule } from './ai-filter';
import type { LearnedDictionary } from './learning-engine';

// ── Lignes SQL ───────────────────────────────────────────────────────────────

export interface AlertRow {
  id: string;
  profile_id: string;
  name: string;
  color: string;
  kind: string;
  position: number;
  enabled: number;
  search_profile: string;
  ai_filter_rule: string | null;
  learned_dict: string;
  company_reputation: string;
  learned_decayed_at: string | null;
  last_fetched_at: string | null;
  created_at: string;
}

const ALERT_COLUMNS =
  'id, profile_id, name, color, kind, position, enabled, search_profile, ' +
  'ai_filter_rule, learned_dict, company_reputation, learned_decayed_at, ' +
  'last_fetched_at, created_at';

// ── Fonctions pures ──────────────────────────────────────────────────────────

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isAlertKind(value: string): value is AlertKind {
  return value === 'core' || value === 'adjacent' || value === 'exploratory' || value === 'opportunistic';
}

/** Identifiant au même format que le `DEFAULT (lower(hex(randomblob(16))))` du schéma. */
export function newAlertId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Traduit une ligne SQL en alerte exploitable. Tolérant par construction : une
 * colonne JSON corrompue ne doit jamais empêcher le chargement du portefeuille,
 * sinon une seule alerte abîmée rendrait toute la veille inaccessible.
 */
export function mapAlertRow(row: AlertRow, sources: JobSource[] = []): JobWatchAlert {
  const storedProfile = parseJson<Partial<SearchProfile>>(row.search_profile, {});
  return {
    id:       row.id,
    name:     row.name,
    color:    row.color || ALERT_KIND_COLORS.core,
    kind:     isAlertKind(row.kind) ? row.kind : 'core',
    position: row.position ?? 0,
    enabled:  row.enabled ? 1 : 0,
    searchProfile: { ...DEFAULT_SEARCH_PROFILE, ...storedProfile },
    aiFilterRule:  parseJson<AIFilterRule | null>(row.ai_filter_rule, null),
    learnedDict:   parseJson<LearnedDictionary>(row.learned_dict, { positive: {}, negative: {} }),
    companyReputation: parseJson<Record<string, number>>(row.company_reputation, {}),
    learnedDecayedAt:  row.learned_decayed_at,
    lastFetchedAt:     row.last_fetched_at,
    createdAt:         row.created_at,
    sources,
  };
}

/**
 * @throws si le portefeuille est déjà au maximum.
 *
 * La limite n'est pas arbitraire : chaque piste supplémentaire multiplie les
 * requêtes vers les sources scrapées et augmente le recouvrement, qui dégrade
 * le signal plus qu'il n'élargit la recherche.
 */
export function assertCanCreateAlert(currentCount: number): void {
  if (currentCount >= MAX_ALERTS) {
    throw new Error(
      `Limite atteinte : ${MAX_ALERTS} pistes maximum. Supprimez ou désactivez une piste existante avant d'en créer une nouvelle.`,
    );
  }
}

/** @throws s'il s'agit de la dernière alerte du portefeuille. */
export function assertCanDeleteAlert(currentCount: number): void {
  if (currentCount <= 1) {
    throw new Error('Impossible de supprimer la dernière piste : la veille doit conserver au moins une recherche.');
  }
}

/** Position de la prochaine alerte créée — toujours en fin de portefeuille. */
export function nextPosition(alerts: Array<{ position: number }>): number {
  return alerts.reduce((max, a) => Math.max(max, a.position + 1), 0);
}

/**
 * Renumérote les positions en 0..n-1 dans l'ordre fourni. Les identifiants
 * inconnus sont ignorés, ceux omis sont replacés en fin dans leur ordre courant.
 */
export function renumberPositions(
  alerts: Array<{ id: string; position: number }>,
  orderedIds: string[],
): Array<{ id: string; position: number }> {
  const known = new Set(alerts.map(a => a.id));
  const ordered = orderedIds.filter(id => known.has(id));
  const missing = alerts
    .filter(a => !ordered.includes(a.id))
    .sort((a, b) => a.position - b.position)
    .map(a => a.id);
  return [...ordered, ...missing].map((id, index) => ({ id, position: index }));
}

/** Nom d'une copie, sans collision avec les noms existants. */
export function duplicateName(name: string, existingNames: string[]): string {
  const taken = new Set(existingNames);
  const base = `${name} (copie)`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${name} (copie ${n})`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface LinkUpdatePlan {
  /** Liaisons à créer. */
  inserts: Array<{ alertId: string; score: number }>;
  /** Liaisons existantes dont le score doit être relevé. */
  scoreUpdates: Array<{ alertId: string; score: number }>;
  /** Meilleur score toutes pistes confondues, après application du plan. */
  bestScore: number;
}

/**
 * Décide de ce qu'il faut écrire pour rattacher une offre à des pistes.
 *
 * Deux règles portent tout le comportement attendu :
 *   - le score d'une liaison existante n'est **relevé** que s'il augmente — une
 *     collecte ultérieure moins favorable ne doit pas dégrader l'historique ;
 *   - `matchedAt` n'est jamais réécrit : c'est la date de première capture par
 *     la piste, dont dépendent le digest et les métriques de recouvrement.
 */
export function planLinkUpdates(
  existing: OfferAlertLink[],
  incoming: Array<{ alertId: string; score: number }>,
): LinkUpdatePlan {
  const byAlert = new Map(existing.map(l => [l.alertId, l]));
  const inserts: Array<{ alertId: string; score: number }> = [];
  const scoreUpdates: Array<{ alertId: string; score: number }> = [];

  for (const { alertId, score } of incoming) {
    const current = byAlert.get(alertId);
    if (!current) {
      inserts.push({ alertId, score });
    } else if (score > current.score) {
      scoreUpdates.push({ alertId, score });
    }
  }

  const scores = [
    ...existing.map(l => l.score),
    ...inserts.map(i => i.score),
    ...scoreUpdates.map(u => u.score),
  ];
  return { inserts, scoreUpdates, bestScore: scores.length ? Math.max(...scores) : 0 };
}

/**
 * Piste à laquelle attribuer une action de l'utilisateur.
 *
 * En vue filtrée, c'est la piste consultée : c'est dans son contexte que
 * l'utilisateur a jugé l'offre. En vue « toutes les pistes », on retient celle
 * qui note l'offre le plus haut — c'est elle qui l'a fait remonter, donc elle
 * qui doit apprendre du verdict.
 */
export function resolveFeedbackAlert(
  links: OfferAlertLink[],
  selectedAlertId: string | null | 'unlinked',
): string | null {
  if (typeof selectedAlertId === 'string' && selectedAlertId !== 'unlinked') {
    if (links.some(l => l.alertId === selectedAlertId)) return selectedAlertId;
  }
  if (links.length === 0) return null;
  return links.reduce((best, l) => (l.score > best.score ? l : best)).alertId;
}

/** Meilleur score d'une offre toutes pistes confondues. */
export function bestScoreOf(links: OfferAlertLink[]): number {
  return links.reduce((max, l) => Math.max(max, l.score), 0);
}

// ── Accès base ───────────────────────────────────────────────────────────────

/** `job_watch_alerts.profile_id` est NOT NULL DEFAULT '' — jamais NULL. */
function normalizeProfileId(profileId: string | null | undefined): string {
  return profileId ?? '';
}

async function loadSourcesByAlert(alertIds: string[]): Promise<Map<string, JobSource[]>> {
  const byAlert = new Map<string, JobSource[]>();
  if (alertIds.length === 0) return byAlert;

  const db = await getDb();
  const placeholders = alertIds.map((_, i) => `?${i + 1}`).join(', ');
  const rows = await db.select<Array<{ alert_id: string; source: JobSource }>>(
    `SELECT alert_id, source FROM job_watch_config
     WHERE alert_id IN (${placeholders}) AND enabled = 1
     ORDER BY source`,
    alertIds,
  );
  for (const row of rows) {
    const list = byAlert.get(row.alert_id) ?? [];
    list.push(row.source);
    byAlert.set(row.alert_id, list);
  }
  return byAlert;
}

export async function listAlerts(profileId: string | null): Promise<JobWatchAlert[]> {
  const db = await getDb();
  const rows = await db.select<AlertRow[]>(
    `SELECT ${ALERT_COLUMNS} FROM job_watch_alerts WHERE profile_id = ?1 ORDER BY position, created_at`,
    [normalizeProfileId(profileId)],
  );
  const sources = await loadSourcesByAlert(rows.map(r => r.id));
  return rows.map(row => mapAlertRow(row, sources.get(row.id) ?? []));
}

export async function getAlert(id: string): Promise<JobWatchAlert | null> {
  const db = await getDb();
  const rows = await db.select<AlertRow[]>(
    `SELECT ${ALERT_COLUMNS} FROM job_watch_alerts WHERE id = ?1`,
    [id],
  );
  if (rows.length === 0) return null;
  const sources = await loadSourcesByAlert([id]);
  return mapAlertRow(rows[0], sources.get(id) ?? []);
}

export interface CreateAlertInput {
  name: string;
  kind?: AlertKind;
  color?: string;
  searchProfile?: Partial<SearchProfile>;
  sources?: JobSource[];
  aiFilterRule?: AIFilterRule | null;
  enabled?: boolean;
}

export async function createAlert(
  profileId: string | null,
  input: CreateAlertInput,
): Promise<JobWatchAlert> {
  const pid = normalizeProfileId(profileId);
  const existing = await listAlerts(profileId);
  assertCanCreateAlert(existing.length);

  const kind = input.kind ?? 'adjacent';
  const id = newAlertId();
  const searchProfile: SearchProfile = {
    ...DEFAULT_SEARCH_PROFILE,
    name: input.name,
    ...input.searchProfile,
  };

  const db = await getDb();
  await db.execute(
    `INSERT INTO job_watch_alerts
       (id, profile_id, name, color, kind, position, enabled, search_profile, ai_filter_rule)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    [
      id,
      pid,
      input.name,
      input.color ?? ALERT_KIND_COLORS[kind],
      kind,
      nextPosition(existing),
      input.enabled === false ? 0 : 1,
      JSON.stringify(searchProfile),
      input.aiFilterRule ? JSON.stringify(input.aiFilterRule) : null,
    ],
  );

  for (const source of input.sources ?? []) {
    await db.execute(
      `INSERT INTO job_watch_config (source, rss_url, enabled, profile_id, alert_id)
       VALUES (?1, NULL, 1, ?2, ?3)`,
      [source, profileId, id],
    );
  }

  const created = await getAlert(id);
  if (!created) throw new Error("La piste n'a pas pu être créée.");
  return created;
}

export type AlertPatch = Partial<
  Pick<
    JobWatchAlert,
    | 'name'
    | 'color'
    | 'kind'
    | 'position'
    | 'enabled'
    | 'searchProfile'
    | 'aiFilterRule'
    | 'learnedDict'
    | 'companyReputation'
    | 'learnedDecayedAt'
    | 'lastFetchedAt'
  >
>;

const PATCH_COLUMNS: Record<keyof AlertPatch, { column: string; serialize: (v: unknown) => unknown }> = {
  name:              { column: 'name',               serialize: v => v },
  color:             { column: 'color',              serialize: v => v },
  kind:              { column: 'kind',               serialize: v => v },
  position:          { column: 'position',           serialize: v => v },
  enabled:           { column: 'enabled',            serialize: v => v },
  searchProfile:     { column: 'search_profile',     serialize: v => JSON.stringify(v) },
  aiFilterRule:      { column: 'ai_filter_rule',     serialize: v => (v ? JSON.stringify(v) : null) },
  learnedDict:       { column: 'learned_dict',       serialize: v => JSON.stringify(v) },
  companyReputation: { column: 'company_reputation', serialize: v => JSON.stringify(v) },
  learnedDecayedAt:  { column: 'learned_decayed_at', serialize: v => v },
  lastFetchedAt:     { column: 'last_fetched_at',    serialize: v => v },
};

export async function updateAlert(id: string, patch: AlertPatch): Promise<void> {
  const entries = (Object.keys(patch) as Array<keyof AlertPatch>)
    .filter(key => patch[key] !== undefined && key in PATCH_COLUMNS)
    .map(key => ({ ...PATCH_COLUMNS[key], value: patch[key] }));
  if (entries.length === 0) return;

  const assignments = entries.map((e, i) => `${e.column} = ?${i + 1}`).join(', ');
  const values = entries.map(e => e.serialize(e.value));

  const db = await getDb();
  await db.execute(
    `UPDATE job_watch_alerts SET ${assignments} WHERE id = ?${entries.length + 1}`,
    [...values, id],
  );
}

/**
 * Supprime une piste, ses sources, ses liaisons et ses logs.
 * Ne supprime jamais d'offre : une offre qui perd tous ses rattachements
 * reste consultable dans « Non rattachées ».
 */
export async function deleteAlert(profileId: string | null, id: string): Promise<void> {
  const existing = await listAlerts(profileId);
  assertCanDeleteAlert(existing.length);

  const db = await getDb();
  await db.execute(`DELETE FROM job_offer_alerts  WHERE alert_id = ?1`, [id]);
  await db.execute(`DELETE FROM job_watch_config  WHERE alert_id = ?1`, [id]);
  await db.execute(`DELETE FROM job_watch_alerts  WHERE id = ?1`, [id]);

  const remaining = existing.filter(a => a.id !== id);
  for (const { id: alertId, position } of renumberPositions(remaining, remaining.map(a => a.id))) {
    await db.execute(`UPDATE job_watch_alerts SET position = ?1 WHERE id = ?2`, [position, alertId]);
  }
}

/**
 * Duplique une piste : profil de recherche, sources et règle IA sont copiés.
 * L'apprentissage et l'historique ne le sont pas — une variante doit repartir
 * d'une page blanche, sinon elle hérite des rejets d'une intention différente.
 */
export async function duplicateAlert(profileId: string | null, id: string): Promise<JobWatchAlert> {
  const existing = await listAlerts(profileId);
  assertCanCreateAlert(existing.length);

  const source = existing.find(a => a.id === id);
  if (!source) throw new Error('Piste introuvable.');

  return createAlert(profileId, {
    name:          duplicateName(source.name, existing.map(a => a.name)),
    kind:          source.kind,
    color:         source.color,
    searchProfile: source.searchProfile,
    sources:       source.sources,
    aiFilterRule:  source.aiFilterRule,
    enabled:       source.enabled === 1,
  });
}

export async function reorderAlerts(profileId: string | null, orderedIds: string[]): Promise<void> {
  const existing = await listAlerts(profileId);
  const db = await getDb();
  for (const { id, position } of renumberPositions(existing, orderedIds)) {
    await db.execute(`UPDATE job_watch_alerts SET position = ?1 WHERE id = ?2`, [position, id]);
  }
}

/**
 * Remplace la sélection de sources d'une piste.
 *
 * Les sources retirées sont supprimées, les nouvelles créées, celles déjà
 * présentes conservées avec leur URL RSS et leur historique de collecte : un
 * import de portefeuille ne doit pas faire perdre un réglage manuel.
 */
export async function replaceAlertSources(
  profileId: string | null,
  alertId: string,
  sources: JobSource[],
): Promise<void> {
  const db = await getDb();
  const current = await db.select<Array<{ id: string; source: JobSource }>>(
    `SELECT id, source FROM job_watch_config WHERE alert_id = ?1`,
    [alertId],
  );
  const wanted = new Set(sources);

  for (const row of current) {
    if (!wanted.has(row.source)) {
      await db.execute(`DELETE FROM job_watch_config WHERE id = ?1`, [row.id]);
    }
  }
  const existing = new Set(current.map(r => r.source));
  for (const source of wanted) {
    if (existing.has(source)) {
      await db.execute(`UPDATE job_watch_config SET enabled = 1 WHERE alert_id = ?1 AND source = ?2`, [alertId, source]);
    } else {
      await db.execute(
        `INSERT INTO job_watch_config (source, rss_url, enabled, profile_id, alert_id)
         VALUES (?1, NULL, 1, ?2, ?3)`,
        [source, profileId, alertId],
      );
    }
  }
}

// ── Liaisons offre ↔ piste ───────────────────────────────────────────────────

export async function loadOfferAlertLinks(offerIds: string[]): Promise<Map<string, OfferAlertLink[]>> {
  const byOffer = new Map<string, OfferAlertLink[]>();
  if (offerIds.length === 0) return byOffer;

  const db = await getDb();
  // Découpage en lots : SQLite plafonne le nombre de paramètres liés (999 par
  // défaut) et la vue Offres peut en charger davantage.
  const BATCH = 500;
  for (let i = 0; i < offerIds.length; i += BATCH) {
    const batch = offerIds.slice(i, i + BATCH);
    const placeholders = batch.map((_, idx) => `?${idx + 1}`).join(', ');
    const rows = await db.select<Array<{ offer_id: string; alert_id: string; score: number; matched_at: string; score_version: number | null }>>(
      `SELECT offer_id, alert_id, score, matched_at, score_version FROM job_offer_alerts
       WHERE offer_id IN (${placeholders}) ORDER BY score DESC`,
      batch,
    );
    for (const row of rows) {
      const list = byOffer.get(row.offer_id) ?? [];
      list.push({ alertId: row.alert_id, score: row.score, matchedAt: row.matched_at, scoreVersion: row.score_version ?? 1 });
      byOffer.set(row.offer_id, list);
    }
  }
  return byOffer;
}

/**
 * Écrit les rattachements d'une offre et réaligne `job_offers.score` sur le
 * meilleur score de ses pistes. Idempotent, et ne touche jamais au statut
 * lu/archivé : celui-ci est porté par l'offre et partagé entre les pistes.
 */
export async function linkOfferToAlerts(
  offerId: string,
  links: Array<{ alertId: string; score: number }>,
): Promise<void> {
  if (links.length === 0) return;

  const db = await getDb();
  const existing = (await loadOfferAlertLinks([offerId])).get(offerId) ?? [];
  const plan = planLinkUpdates(existing, links);

  for (const { alertId, score } of plan.inserts) {
    await db.execute(
      `INSERT OR IGNORE INTO job_offer_alerts (offer_id, alert_id, score, score_version) VALUES (?1, ?2, ?3, ?4)`,
      [offerId, alertId, score, SCORER_VERSION],
    );
  }
  for (const { alertId, score } of plan.scoreUpdates) {
    await db.execute(
      `UPDATE job_offer_alerts SET score = ?1, score_version = ?4 WHERE offer_id = ?2 AND alert_id = ?3`,
      [score, offerId, alertId, SCORER_VERSION],
    );
  }
  if (plan.inserts.length > 0 || plan.scoreUpdates.length > 0) {
    await db.execute(
      `UPDATE job_offers SET score = ?1, score_version = ?3 WHERE id = ?2 AND (score < ?1 OR score_version < ?3)`,
      [plan.bestScore, offerId, SCORER_VERSION],
    );
  }
}
