export type Likelihood =
  | "VERY_LIKELY"
  | "LIKELY"
  | "POSSIBLE"
  | "UNLIKELY"
  | "VERY_UNLIKELY";

export type ProposalSource =
  | "approved_fqn"
  | "name_rule"
  | "name_rule_shape_mismatch"
  | "conflict"
  | "dlp_map"
  | "mixed"
  | "low_hit_rate"
  | "unmapped";

export type EventType =
  | "CONFIRMED"
  | "NEW_UNTAGGED"
  | "TERM_UPGRADE"
  | "TERM_DOWNGRADE"
  | "UNTAG_CANDIDATE"
  | "TAXONOMY_ONLY"
  | "SCHEMA_DRIFT"
  | "REJECTED_REPEAT"
  | "MIXED"
  | "NEEDS_REVIEW"
  | "NAME_RULE_NEW"
  | "SHAPE_MISMATCH"
  | "CONFLICT";

export type EventStatus =
  | "open"
  | "approved"
  | "rejected"
  | "suppressed"
  | "confirmed";

export type DecisionStatus = "approved" | "rejected" | "untag_approved";
export type LockPolicy = "lock" | "allow_upgrade" | "allow_untag";
export type TermFamily = "identifier" | "pii" | "other";
export type MatchType = "exact_normalized" | "regex" | "path_suffix";
export type ScopeType = "org" | "project" | "dataset" | "table_prefix";

export type HistogramBucket = {
  info_type: string;
  findings: number;
  very_likely: number;
  likely: number;
  possible: number;
};

export type DlpTopType = {
  info_type: string;
  share: number;
};

export type DlpPayload = {
  dominant_info_type: string | null;
  is_mixed: boolean;
  dominant_share: number | null;
  hit_band: HitBand;
  top_info_types: DlpTopType[];
};

export type ValuePayload = {
  null_rate_band: HitBand;
  ndv_band: NdvBand;
  length_p50: number | null;
  top_value_hashes: string[];
};

export type HitBand = "lt_1pct" | "1_10pct" | "10_50pct" | "ge_50pct" | null;
export type NdvBand = "1" | "2_10" | "11_100" | "101_1k" | "1k_plus" | null;

export type DlpFinding = {
  job_id: string;
  create_time: string;
  project_id: string;
  dataset_id: string;
  table_id: string;
  field_name: string;
  info_type: string;
  likelihood: Likelihood;
  quote: string | null;
  quote_hash: string | null;
  rows_inspected: number | null;
};

export type ColumnMetadata = {
  project_id: string;
  dataset_id: string;
  table_id: string;
  column_name: string;
  field_path: string;
  data_type: string;
  description: string;
  is_nullable: boolean;
  existing_policy_tag: string | null;
  approx_ndv: number | null;
  null_rate: number | null;
  length_p50: number | null;
  row_count: number | null;
};

export type Term = {
  term_id: string;
  display_name: string;
  description: string;
  when_to_use: string;
  when_not_to_use: string;
  policy_tag_resource: string;
  sensitivity_rank: number;
  parent_term_id: string | null;
  term_family: TermFamily;
  dlp_info_types: string[];
  masking_policy: "HASH" | "ALWAYS_NULL" | "DEFAULT" | "NONE";
  auto_propose_ok: boolean;
  active: boolean;
  expected_types: string[];
  min_length: number | null;
  max_length: number | null;
  min_ndv: number | null;
  max_ndv: number | null;
  max_null_rate: number | null;
};

export type InfoTypeMap = {
  info_type: string;
  term_id: string;
  priority: number;
};

export type ColumnNameRule = {
  rule_id: string;
  match_type: MatchType;
  pattern: string;
  term_id: string;
  scope_type: ScopeType;
  scope_value: string;
  confidence: number;
  source: "manual_seed" | "promoted_decision";
  allow_auto_propose: boolean;
  allow_auto_apply: boolean;
  created_from_fqn: string | null;
  notes: string;
  active: boolean;
  created_at: string;
};

export type NameRuleNegative = {
  negative_id: string;
  pattern: string;
  scope_type: ScopeType;
  scope_value: string;
  rejected_term_id: string;
  column_fqn: string;
  notes: string;
  created_at: string;
};

export type ColumnProfile = {
  profile_id: string;
  scan_id: string;
  profiled_at: string;
  project_id: string;
  dataset_id: string;
  table_id: string;
  field_name: string;
  column_fqn: string;
  data_type: string | null;
  column_description: string | null;
  existing_policy_tag: string | null;
  name_normalized: string;
  name_suffix: string;
  rows_inspected: number | null;
  findings_total: number;
  hit_rate: number | null;
  info_type_histogram: HistogramBucket[];
  dominant_info_type: string | null;
  dominant_share: number | null;
  is_mixed: boolean;
  sample_quotes: string[];
  sample_value_hashes: string[];
  approx_ndv: number | null;
  null_rate: number | null;
  length_p50: number | null;
  dlp_payload: DlpPayload;
  value_payload: ValuePayload;
  dlp_fingerprint: number;
  value_fingerprint: number;
  proposed_term_id: string | null;
  name_rule_term_id: string | null;
  dlp_term_id: string | null;
  proposal_source: ProposalSource | null;
  proposal_rule_id: string | null;
  proposal_reason: string;
  shape_ok: boolean | null;
};

export type ApprovedDecision = {
  column_fqn: string;
  term_id: string | null;
  policy_tag_resource: string | null;
  status: DecisionStatus;
  rejected_term_id: string | null;
  lock_policy: LockPolicy;
  approved_by: string;
  approved_at: string;
  taxonomy_version: string;
  last_confirmed_scan_id: string | null;
  last_dlp_fingerprint: number | null;
  last_value_fingerprint: number | null;
  last_dlp_payload: DlpPayload | null;
  last_value_payload: ValuePayload | null;
  notes: string;
  do_not_ask_until: string | null;
};

export type DriftEvent = {
  event_id: string;
  scan_id: string;
  column_fqn: string;
  event_type: EventType;
  previous_term_id: string | null;
  proposed_term_id: string | null;
  previous_sensitivity_rank: number | null;
  proposed_sensitivity_rank: number | null;
  previous_dlp_fingerprint: number | null;
  new_dlp_fingerprint: number | null;
  previous_value_fingerprint: number | null;
  new_value_fingerprint: number | null;
  material_change: boolean;
  live_policy_tag: string | null;
  approved_policy_tag: string | null;
  proposal_source: ProposalSource | null;
  status: EventStatus;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
};

export type ReviewAudit = {
  audit_id: string;
  event_id: string | null;
  column_fqn: string;
  action: string;
  actor: string;
  at: string;
  previous_term_id: string | null;
  new_term_id: string | null;
  notes: string;
  details: Record<string, unknown>;
};

export type GovStore = {
  dlp_findings: DlpFinding[];
  column_metadata: ColumnMetadata[];
  term_catalog: Term[];
  info_type_map: InfoTypeMap[];
  column_name_rules: ColumnNameRule[];
  column_name_rule_negatives: NameRuleNegative[];
  column_profiles: ColumnProfile[];
  approved_decisions: ApprovedDecision[];
  drift_events: DriftEvent[];
  review_audit: ReviewAudit[];
};

export type QueueFilters = {
  status?: EventStatus | "all" | "default";
  event_type?: EventType | "";
  proposal_source?: ProposalSource | "";
  dataset?: string;
  upgrades_only?: boolean;
  q?: string;
};

export type QueueRow = {
  event: DriftEvent;
  profile: ColumnProfile | null;
  previous_term: Term | null;
  proposed_term: Term | null;
  table_id: string;
  field_name: string;
  dataset_id: string;
  hit_rate: number | null;
  dominant_info_type: string | null;
  age_hours: number;
};

export type ColumnDetail = {
  fqn: string;
  metadata: ColumnMetadata | null;
  latest: ColumnProfile | null;
  previous: ColumnProfile | null;
  decision: ApprovedDecision | null;
  event: DriftEvent | null;
  events: DriftEvent[];
  proposed_term: Term | null;
  previous_term: Term | null;
  dlp_term: Term | null;
  name_rule_term: Term | null;
  matched_rule: ColumnNameRule | null;
  terms: Term[];
};
