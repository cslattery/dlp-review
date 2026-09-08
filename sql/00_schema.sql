-- gov_dlp schema: incoming DLP findings, column metadata, catalog, and
-- generated profiles / decisions / drift / audit.
-- Dataset: gov_dlp

CREATE SCHEMA IF NOT EXISTS gov_dlp OPTIONS (
  description = 'Cloud DLP column classification review (local-first slice)'
);

-- Incoming: flattened DLP inspect export (one row per finding)
CREATE TABLE IF NOT EXISTS gov_dlp.dlp_findings (
  job_id STRING,
  create_time TIMESTAMP,
  project_id STRING,
  dataset_id STRING,
  table_id STRING,
  field_name STRING,
  info_type STRING,
  likelihood STRING,
  quote STRING,
  quote_hash STRING,
  rows_inspected INT64
);

CREATE TABLE IF NOT EXISTS gov_dlp.column_metadata (
  project_id STRING,
  dataset_id STRING,
  table_id STRING,
  column_name STRING,
  field_path STRING,
  data_type STRING,
  description STRING,
  is_nullable BOOL,
  existing_policy_tag STRING,
  approx_ndv INT64,
  null_rate FLOAT64,
  length_p50 INT64,
  row_count INT64
);

CREATE TABLE IF NOT EXISTS gov_dlp.term_catalog (
  term_id STRING,
  display_name STRING,
  description STRING,
  when_to_use STRING,
  when_not_to_use STRING,
  policy_tag_resource STRING,
  sensitivity_rank INT64,
  parent_term_id STRING,
  term_family STRING,
  dlp_info_types ARRAY<STRING>,
  masking_policy STRING,
  auto_propose_ok BOOL,
  active BOOL,
  expected_types ARRAY<STRING>,
  min_length INT64,
  max_length INT64,
  min_ndv INT64,
  max_ndv INT64,
  max_null_rate FLOAT64
);

CREATE TABLE IF NOT EXISTS gov_dlp.info_type_map (
  info_type STRING,
  term_id STRING,
  priority INT64
);

CREATE TABLE IF NOT EXISTS gov_dlp.column_name_rules (
  rule_id STRING,
  match_type STRING,
  pattern STRING,
  term_id STRING,
  scope_type STRING,
  scope_value STRING,
  confidence FLOAT64,
  source STRING,
  allow_auto_propose BOOL,
  allow_auto_apply BOOL,
  created_from_fqn STRING,
  notes STRING,
  active BOOL,
  created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gov_dlp.column_name_rule_negatives (
  negative_id STRING,
  pattern STRING,
  scope_type STRING,
  scope_value STRING,
  rejected_term_id STRING,
  column_fqn STRING,
  notes STRING,
  created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gov_dlp.column_profiles (
  profile_id STRING,
  scan_id STRING,
  profiled_at TIMESTAMP,
  project_id STRING,
  dataset_id STRING,
  table_id STRING,
  field_name STRING,
  column_fqn STRING,
  data_type STRING,
  column_description STRING,
  existing_policy_tag STRING,
  name_normalized STRING,
  name_suffix STRING,
  rows_inspected INT64,
  findings_total INT64,
  hit_rate FLOAT64,
  info_type_histogram ARRAY<STRUCT<
    info_type STRING,
    findings INT64,
    very_likely INT64,
    likely INT64,
    possible INT64
  >>,
  dominant_info_type STRING,
  dominant_share FLOAT64,
  is_mixed BOOL,
  sample_quotes ARRAY<STRING>,
  sample_value_hashes ARRAY<STRING>,
  approx_ndv INT64,
  null_rate FLOAT64,
  length_p50 INT64,
  dlp_payload JSON,
  value_payload JSON,
  dlp_fingerprint INT64,
  value_fingerprint INT64,
  proposed_term_id STRING,
  name_rule_term_id STRING,
  dlp_term_id STRING,
  proposal_source STRING,
  proposal_rule_id STRING,
  proposal_reason STRING,
  shape_ok BOOL
);

CREATE TABLE IF NOT EXISTS gov_dlp.approved_decisions (
  column_fqn STRING,
  term_id STRING,
  policy_tag_resource STRING,
  status STRING,
  rejected_term_id STRING,
  lock_policy STRING,
  approved_by STRING,
  approved_at TIMESTAMP,
  taxonomy_version STRING,
  last_confirmed_scan_id STRING,
  last_dlp_fingerprint INT64,
  last_value_fingerprint INT64,
  notes STRING,
  do_not_ask_until TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gov_dlp.drift_events (
  event_id STRING,
  scan_id STRING,
  column_fqn STRING,
  event_type STRING,
  previous_term_id STRING,
  proposed_term_id STRING,
  previous_sensitivity_rank INT64,
  proposed_sensitivity_rank INT64,
  previous_dlp_fingerprint INT64,
  new_dlp_fingerprint INT64,
  previous_value_fingerprint INT64,
  new_value_fingerprint INT64,
  material_change BOOL,
  live_policy_tag STRING,
  approved_policy_tag STRING,
  proposal_source STRING,
  status STRING,
  created_at TIMESTAMP,
  reviewed_by STRING,
  reviewed_at TIMESTAMP,
  review_notes STRING
);

CREATE TABLE IF NOT EXISTS gov_dlp.review_audit (
  audit_id STRING,
  event_id STRING,
  column_fqn STRING,
  action STRING,
  actor STRING,
  at TIMESTAMP,
  previous_term_id STRING,
  new_term_id STRING,
  notes STRING,
  details JSON
);
