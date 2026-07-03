/**
 * Utility for SQL Injection prevention by whitelisting allowed columns.
 */

const ALLOWED_COLUMNS: Record<string, string[]> = {
  profiles: [
    'id',
    'first_name',
    'last_name',
    'email',
    'phone',
    'address',
    'city',
    'postal_code',
    'country',
    'linkedin_url',
    'github_url',
    'portfolio_url',
    'photo_path',
    'title',
    'summary',
    'created_at',
    'updated_at',
  ],
  master_entries: [
    'id',
    'profile_id',
    'entry_type',
    'title',
    'subtitle',
    'location',
    'start_date',
    'end_date',
    'is_current',
    'description',
    'metadata',
    'sort_order',
    'tags',
    'created_at',
    'updated_at',
  ],
  cv_documents: [
    'id',
    'profile_id',
    'name',
    'template_id',
    'target_job',
    'target_company',
    'custom_summary',
    'settings',
    'is_favorite',
    'last_exported',
    'markdown_content',
    'markdown_mode',
    'created_at',
    'updated_at',
  ],
  cv_blocks: [
    'id',
    'cv_id',
    'entry_id',
    'block_type',
    'section_name',
    'custom_content',
    'sort_order',
    'is_visible',
    'override_data',
    'created_at',
  ],
  applications: [
    'id',
    'profile_id',
    'cv_id',
    'company_name',
    'job_title',
    'job_url',
    'source',
    'source_detail',
    'contact_name',
    'contact_email',
    'contact_phone',
    'status',
    'salary_min',
    'salary_max',
    'location',
    'remote_policy',
    'priority',
    'notes',
    'job_description',
    'applied_at',
    'next_action',
    'next_action_date',
    'rejection_reason',
    'rejection_email',
    'created_at',
    'updated_at',
  ],
  application_events: [
    'id',
    'application_id',
    'event_type',
    'event_date',
    'title',
    'description',
    'old_status',
    'new_status',
    'calendar_id',
    'created_at',
  ],
  application_attachments: [
    'id',
    'application_id',
    'file_name',
    'file_path',
    'file_type',
    'file_size',
    'label',
    'created_at',
  ],
  job_watch_config: [
    'id',
    'source',
    'keywords',
    'exclude_keywords',
    'location',
    'radius_km',
    'contract_types',
    'rss_url',
    'ft_dept_code',
    'enabled',
    'last_fetched_at',
    'profile_id',
    'created_at',
  ],
  job_offers: [
    'id',
    'profile_id',
    'source',
    'url',
    'hash',
    'title',
    'company',
    'location',
    'location_lat',
    'location_lon',
    'contract_type',
    'description_snippet',
    'published_at',
    'fetched_at',
    'score',
    'commute_minutes',
    'commute_status',
    'salary_min',
    'salary_max',
    'salary_raw',
    'is_read',
    'is_archived',
    'archived_at',
    'kanban_id',
  ],
  job_offer_feedback: [
    'id',
    'offer_id',
    'action',
    'time_to_action',
    'created_at',
  ],
  job_watch_fetch_log: [
    'id',
    'source',
    'fetched_at',
    'offers_fetched',
    'offers_new',
    'offers_duplicate',
    'offers_filtered',
    'status',
    'error_message',
    'duration_ms',
  ],
  job_watch_settings: [
    'key',
    'profile_id',
    'value',
  ],
  entry_variant_history: [
    'id',
    'master_entry_id',
    'source_cv_id',
    'source_cv_name',
    'raw_title',
    'raw_subtitle',
    'raw_location',
    'raw_start_date',
    'raw_end_date',
    'raw_is_current',
    'raw_description',
    'match_score',
    'match_criteria',
    'resolution',
    'synced_at',
  ],
  settings: [
    'key',
    'value',
  ],
};

/**
 * Filters the keys of an object based on a whitelist of allowed columns for a given table.
 * This is used to prevent SQL Injection when column names are dynamically generated.
 *
 * @param tableName The name of the database table.
 * @param data An object where keys are column names and values are data to be inserted or updated.
 * @returns A new object containing only the allowed columns.
 */
export function filterAllowedColumns<T extends Record<string, unknown>>(
  tableName: string,
  data: T
): T {
  const allowed = ALLOWED_COLUMNS[tableName];
  if (!allowed) {
    throw new Error(`Table "${tableName}" is not defined in the allowed columns whitelist.`);
  }

  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (allowed.includes(key)) {
      filtered[key] = data[key];
    }
  }

  return filtered as T;
}
