import { sha256Hex } from "./fingerprint";
import type {
  ApprovedDecision,
  ColumnMetadata,
  ColumnNameRule,
  DlpFinding,
  InfoTypeMap,
  Likelihood,
  NameRuleNegative,
  Term,
} from "./types";

export const PROJECT = "myproj";
export const SCAN_CURRENT = "scan_20260908";
export const SCAN_PREV = "scan_20260801";
export const PROFILED_AT = "2026-09-08T09:15:00Z";
export const PROFILED_PREV = "2026-08-01T09:15:00Z";
export const FINDING_TIME = "2026-09-08T08:40:00Z";
export const FINDING_PREV = "2026-08-01T08:40:00Z";
export const TAXONOMY = "projects/myproj/locations/us/taxonomies/dlp_governance/policyTags";

export function tag(slug: string): string {
  return `${TAXONOMY}/${slug}`;
}

export const TERMS: Term[] = [
  {
    term_id: "pii.customer.email",
    display_name: "Customer email",
    description: "A mailbox that can reach a person.",
    when_to_use: "Columns whose values are primarily email addresses.",
    when_not_to_use: "Free-text notes that occasionally mention an email.",
    policy_tag_resource: tag("customer_email"),
    sensitivity_rank: 50,
    parent_term_id: null,
    term_family: "pii",
    dlp_info_types: ["EMAIL_ADDRESS"],
    masking_policy: "HASH",
    auto_propose_ok: true,
    active: true,
    expected_types: ["STRING"],
    min_length: 6,
    max_length: 254,
    min_ndv: 50,
    max_ndv: null,
    max_null_rate: 0.4,
  },
  {
    term_id: "pii.customer.phone",
    display_name: "Customer phone",
    description: "A personal or billing phone number.",
    when_to_use: "Direct-dial numbers stored as a dedicated column.",
    when_not_to_use: "Mixed contact blobs or extension-only fields.",
    policy_tag_resource: tag("customer_phone"),
    sensitivity_rank: 45,
    parent_term_id: null,
    term_family: "pii",
    dlp_info_types: ["PHONE_NUMBER"],
    masking_policy: "HASH",
    auto_propose_ok: true,
    active: true,
    expected_types: ["STRING", "INT64"],
    min_length: 7,
    max_length: 20,
    min_ndv: 20,
    max_ndv: null,
    max_null_rate: 0.5,
  },
  {
    term_id: "pii.customer.name",
    display_name: "Customer name",
    description: "A person's given or family name.",
    when_to_use: "Name columns for people.",
    when_not_to_use: "Product, venue, or legal-entity names.",
    policy_tag_resource: tag("customer_name"),
    sensitivity_rank: 40,
    parent_term_id: null,
    term_family: "pii",
    dlp_info_types: ["PERSON_NAME"],
    masking_policy: "DEFAULT",
    auto_propose_ok: true,
    active: true,
    expected_types: ["STRING"],
    min_length: 2,
    max_length: 80,
    min_ndv: 10,
    max_ndv: null,
    max_null_rate: 0.3,
  },
  {
    term_id: "pii.customer.dob",
    display_name: "Date of birth",
    description: "A person's date of birth.",
    when_to_use: "Dedicated DOB columns.",
    when_not_to_use: "Event dates, created_at, or order dates.",
    policy_tag_resource: tag("customer_dob"),
    sensitivity_rank: 60,
    parent_term_id: null,
    term_family: "pii",
    dlp_info_types: ["DATE_OF_BIRTH"],
    masking_policy: "ALWAYS_NULL",
    auto_propose_ok: true,
    active: true,
    expected_types: ["DATE", "TIMESTAMP", "STRING"],
    min_length: null,
    max_length: null,
    min_ndv: 20,
    max_ndv: null,
    max_null_rate: 0.4,
  },
  {
    term_id: "pii.customer.national_id",
    display_name: "National id / payment PAN",
    description: "Government id or primary account number.",
    when_to_use: "NI numbers, national ids, or card PANs.",
    when_not_to_use: "Internal surrogate keys and site codes.",
    policy_tag_resource: tag("customer_national_id"),
    sensitivity_rank: 80,
    parent_term_id: null,
    term_family: "pii",
    dlp_info_types: ["CREDIT_CARD_NUMBER", "UK_NATIONAL_INSURANCE_NUMBER"],
    masking_policy: "ALWAYS_NULL",
    auto_propose_ok: true,
    active: true,
    expected_types: ["STRING"],
    min_length: 8,
    max_length: 19,
    min_ndv: 20,
    max_ndv: null,
    max_null_rate: 0.3,
  },
  {
    term_id: "pii.customer.address",
    display_name: "Customer address",
    description: "A street or postal address.",
    when_to_use: "Structured or free-text address columns.",
    when_not_to_use: "City-only or country-code columns.",
    policy_tag_resource: tag("customer_address"),
    sensitivity_rank: 35,
    parent_term_id: null,
    term_family: "pii",
    dlp_info_types: ["STREET_ADDRESS"],
    masking_policy: "DEFAULT",
    auto_propose_ok: true,
    active: true,
    expected_types: ["STRING"],
    min_length: 8,
    max_length: 200,
    min_ndv: 20,
    max_ndv: null,
    max_null_rate: 0.5,
  },
  {
    term_id: "pii.free_text",
    display_name: "Free text (may contain PII)",
    description: "Unstructured notes that can leak PII.",
    when_to_use: "Comments, tickets, and support notes.",
    when_not_to_use: "Dedicated identifier or PII columns.",
    policy_tag_resource: tag("free_text"),
    sensitivity_rank: 20,
    parent_term_id: null,
    term_family: "pii",
    dlp_info_types: [],
    masking_policy: "DEFAULT",
    auto_propose_ok: false,
    active: true,
    expected_types: ["STRING"],
    min_length: null,
    max_length: null,
    min_ndv: null,
    max_ndv: null,
    max_null_rate: null,
  },
  {
    term_id: "pii.mixed",
    display_name: "Mixed PII",
    description: "A column that holds more than one PII class.",
    when_to_use: "Contact blobs with email and phone together.",
    when_not_to_use: "A column with one dominant infoType.",
    policy_tag_resource: tag("mixed_pii"),
    sensitivity_rank: 70,
    parent_term_id: null,
    term_family: "pii",
    dlp_info_types: [],
    masking_policy: "ALWAYS_NULL",
    auto_propose_ok: false,
    active: true,
    expected_types: ["STRING"],
    min_length: null,
    max_length: null,
    min_ndv: null,
    max_ndv: null,
    max_null_rate: null,
  },
  {
    term_id: "identifier.network.site",
    display_name: "Radio / network site id",
    description: "A 5–7 digit site key. DLP will not detect these safely.",
    when_to_use: "site_id, siteid, site_code, or customer.site.id.",
    when_not_to_use: "job_id, UUID tokens, or payment identifiers.",
    policy_tag_resource: tag("network_site"),
    sensitivity_rank: 15,
    parent_term_id: null,
    term_family: "identifier",
    dlp_info_types: [],
    masking_policy: "NONE",
    auto_propose_ok: true,
    active: true,
    expected_types: ["INT64", "STRING", "NUMERIC"],
    min_length: 4,
    max_length: 8,
    min_ndv: 10,
    max_ndv: 100000,
    max_null_rate: 0.3,
  },
  {
    term_id: "identifier.network.exchange",
    display_name: "Exchange / PoP id",
    description: "An exchange or point-of-presence code.",
    when_to_use: "exchange_id and pop_id columns.",
    when_not_to_use: "Generic location text.",
    policy_tag_resource: tag("network_exchange"),
    sensitivity_rank: 15,
    parent_term_id: null,
    term_family: "identifier",
    dlp_info_types: [],
    masking_policy: "NONE",
    auto_propose_ok: true,
    active: true,
    expected_types: ["STRING", "INT64"],
    min_length: 3,
    max_length: 12,
    min_ndv: 5,
    max_ndv: 50000,
    max_null_rate: 0.3,
  },
  {
    term_id: "identifier.account.number",
    display_name: "Account number",
    description: "An internal account or billing identifier.",
    when_to_use: "Account numbers that are not national ids.",
    when_not_to_use: "Card PANs or government ids.",
    policy_tag_resource: tag("account_number"),
    sensitivity_rank: 25,
    parent_term_id: null,
    term_family: "identifier",
    dlp_info_types: [],
    masking_policy: "HASH",
    auto_propose_ok: true,
    active: true,
    expected_types: ["STRING", "INT64"],
    min_length: 6,
    max_length: 20,
    min_ndv: 50,
    max_ndv: null,
    max_null_rate: 0.2,
  },
  {
    term_id: "other.unclassified",
    display_name: "Unclassified",
    description: "No business term assigned yet.",
    when_to_use: "Explicit steward decision that a column is not in the catalog.",
    when_not_to_use: "As an auto-proposal.",
    policy_tag_resource: tag("unclassified"),
    sensitivity_rank: 0,
    parent_term_id: null,
    term_family: "other",
    dlp_info_types: [],
    masking_policy: "NONE",
    auto_propose_ok: false,
    active: true,
    expected_types: [],
    min_length: null,
    max_length: null,
    min_ndv: null,
    max_ndv: null,
    max_null_rate: null,
  },
];

export const INFO_TYPE_MAP: InfoTypeMap[] = [
  { info_type: "EMAIL_ADDRESS", term_id: "pii.customer.email", priority: 10 },
  { info_type: "PHONE_NUMBER", term_id: "pii.customer.phone", priority: 10 },
  { info_type: "PERSON_NAME", term_id: "pii.customer.name", priority: 10 },
  { info_type: "DATE_OF_BIRTH", term_id: "pii.customer.dob", priority: 10 },
  { info_type: "CREDIT_CARD_NUMBER", term_id: "pii.customer.national_id", priority: 10 },
  { info_type: "UK_NATIONAL_INSURANCE_NUMBER", term_id: "pii.customer.national_id", priority: 10 },
  { info_type: "STREET_ADDRESS", term_id: "pii.customer.address", priority: 10 },
];

export const NAME_RULES: ColumnNameRule[] = [
  {
    rule_id: "rule_site_id_ran_prod",
    match_type: "exact_normalized",
    pattern: "site_id",
    term_id: "identifier.network.site",
    scope_type: "dataset",
    scope_value: "myproj.ran_prod",
    confidence: 0.95,
    source: "manual_seed",
    allow_auto_propose: true,
    allow_auto_apply: false,
    created_from_fqn: "myproj.ran_prod.sites.site_id",
    notes: "RAN site keys are 6-digit ints. Never a custom DLP regex.",
    active: true,
    created_at: "2026-01-12T10:00:00Z",
  },
  {
    rule_id: "rule_siteid_ran_prod",
    match_type: "exact_normalized",
    pattern: "siteid",
    term_id: "identifier.network.site",
    scope_type: "dataset",
    scope_value: "myproj.ran_prod",
    confidence: 0.93,
    source: "manual_seed",
    allow_auto_propose: true,
    allow_auto_apply: false,
    created_from_fqn: null,
    notes: "Collapsed camelCase form.",
    active: true,
    created_at: "2026-01-12T10:00:00Z",
  },
  {
    rule_id: "rule_site_code_ran_prod",
    match_type: "exact_normalized",
    pattern: "site_code",
    term_id: "identifier.network.site",
    scope_type: "dataset",
    scope_value: "myproj.ran_prod",
    confidence: 0.9,
    source: "manual_seed",
    allow_auto_propose: true,
    allow_auto_apply: false,
    created_from_fqn: null,
    notes: "",
    active: true,
    created_at: "2026-01-12T10:00:00Z",
  },
  {
    rule_id: "rule_site_id_project",
    match_type: "exact_normalized",
    pattern: "site_id",
    term_id: "identifier.network.site",
    scope_type: "project",
    scope_value: "myproj",
    confidence: 0.8,
    source: "manual_seed",
    allow_auto_propose: true,
    allow_auto_apply: false,
    created_from_fqn: null,
    notes: "Project-wide suggestion for site_id. Shape-checked against the catalog.",
    active: true,
    created_at: "2026-01-12T10:00:00Z",
  },
  {
    rule_id: "rule_path_suffix_site_id",
    match_type: "path_suffix",
    pattern: "site_id",
    term_id: "identifier.network.site",
    scope_type: "org",
    scope_value: "*",
    confidence: 0.75,
    source: "manual_seed",
    allow_auto_propose: true,
    allow_auto_apply: false,
    created_from_fqn: null,
    notes: "Nested paths such as customer.site.id → site_id.",
    active: true,
    created_at: "2026-02-01T10:00:00Z",
  },
  {
    rule_id: "rule_regex_site",
    match_type: "regex",
    pattern: "(^|_)site(_?id|_code)$",
    term_id: "identifier.network.site",
    scope_type: "org",
    scope_value: "*",
    confidence: 0.55,
    source: "manual_seed",
    allow_auto_propose: true,
    allow_auto_apply: false,
    created_from_fqn: null,
    notes: "Low-confidence safety net. Still suggestion-only.",
    active: true,
    created_at: "2026-02-01T10:00:00Z",
  },
  {
    rule_id: "rule_exchange_id",
    match_type: "exact_normalized",
    pattern: "exchange_id",
    term_id: "identifier.network.exchange",
    scope_type: "org",
    scope_value: "*",
    confidence: 0.88,
    source: "manual_seed",
    allow_auto_propose: true,
    allow_auto_apply: false,
    created_from_fqn: null,
    notes: "",
    active: true,
    created_at: "2026-02-01T10:00:00Z",
  },
  {
    rule_id: "rule_pop_id",
    match_type: "exact_normalized",
    pattern: "pop_id",
    term_id: "identifier.network.exchange",
    scope_type: "org",
    scope_value: "*",
    confidence: 0.88,
    source: "manual_seed",
    allow_auto_propose: true,
    allow_auto_apply: false,
    created_from_fqn: null,
    notes: "",
    active: true,
    created_at: "2026-02-01T10:00:00Z",
  },
];

export const NEGATIVES: NameRuleNegative[] = [
  {
    negative_id: "neg_job_id_site",
    pattern: "job_id",
    scope_type: "dataset",
    scope_value: "myproj.ops",
    rejected_term_id: "identifier.network.site",
    column_fqn: "myproj.ops.jobs.job_id",
    notes: "job_id is an ops key, never a radio site.",
    created_at: "2026-03-04T12:00:00Z",
  },
];

type MetaSpec = ColumnMetadata;

export const METADATA: MetaSpec[] = [
  meta("customers", "customers", "email", "email", "STRING", "Primary login email.", null, 98000, 0.02, 22, 1000),
  meta("customers", "customers", "notes", "notes", "STRING", "Free-text support notes.", null, 82000, 0.11, 180, 1000),
  meta("products", "products", "product_name", "product_name", "STRING", "Catalogue product title.", null, 12000, 0.0, 28, 80),
  meta("customers", "customers", "contact", "contact", "STRING", "Legacy contact blob.", null, 9400, 0.04, 40, 100),
  meta("customers", "customers", "email_stable", "email_stable", "STRING", "Billing email, already tagged.", tag("customer_email"), 99000, 0.01, 21, 1000),
  meta("customers", "customers", "legacy_id", "legacy_id", "STRING", "Was billed as email; rescan looks like national id.", tag("customer_email"), 81000, 0.03, 9, 1000),
  meta("kyc", "subjects", "national_id", "national_id", "STRING", "Subject national identifier.", tag("customer_national_id"), 74000, 0.05, 18, 1000),
  meta("customers", "customers", "retired_email", "retired_email", "STRING", "Column quietly emptied after a purge.", tag("customer_email"), 12, 0.91, 0, 1000),
  meta("customers", "customers", "notes_free", "notes_free", "STRING", "Notes previously rejected as email.", null, 76000, 0.08, 140, 1000),
  meta("customers", "customers", "mobile", "mobile", "STRING", "Mobile number. Live tag disagrees with last approval.", tag("customer_email"), 88000, 0.04, 12, 800),
  meta("raw", "events", "widget_token", "widget_token", "STRING", "Custom widget token, no catalog map.", null, 50000, 0.0, 24, 500),
  meta("customers", "customer", "id", "site.id", "INT64", "Nested site key on the customer record.", null, 6100, 0.01, 6, 20000),
  meta("ran_prod", "sites", "site_id", "site_id", "INT64", "6-digit RAN site identifier.", null, 4200, 0.0, 6, 4200),
  meta("ops", "jobs", "job_id", "job_id", "STRING", "Airflow / batch job id.", null, 180000, 0.0, 16, 180000),
  meta("staging", "sites", "site_id", "site_id", "STRING", "Staging copy using 32-char hex tokens.", null, 900, 0.02, 32, 900),
  meta("finance", "cards", "site_id", "site_id", "STRING", "Misnamed column that holds card PANs.", null, 64000, 0.01, 16, 800),
];

export const PREV_METADATA_OVERRIDES: Record<string, Partial<ColumnMetadata>> = {
  "myproj.customers.customers.legacy_id": {
    approx_ndv: 96000,
    null_rate: 0.02,
    length_p50: 22,
  },
  "myproj.kyc.subjects.national_id": {
    approx_ndv: 70000,
    null_rate: 0.04,
    length_p50: 9,
  },
  "myproj.customers.customers.retired_email": {
    approx_ndv: 94000,
    null_rate: 0.02,
    length_p50: 22,
    existing_policy_tag: tag("customer_email"),
  },
};

type BucketSpec = {
  info_type: string;
  findings: number;
  likelihood: Likelihood;
  quotes?: string[];
};

export type FindingSpec = {
  dataset: string;
  table: string;
  field: string;
  rows: number;
  buckets: BucketSpec[];
};

export const CURRENT_FINDING_SPECS: FindingSpec[] = [
  {
    dataset: "customers",
    table: "customers",
    field: "email",
    rows: 1000,
    buckets: [
      {
        info_type: "EMAIL_ADDRESS",
        findings: 90,
        likelihood: "VERY_LIKELY",
        quotes: ["a***@retail.example", "b***@home.example"],
      },
    ],
  },
  {
    dataset: "customers",
    table: "customers",
    field: "notes",
    rows: 1000,
    buckets: [
      {
        info_type: "EMAIL_ADDRESS",
        findings: 2,
        likelihood: "POSSIBLE",
        quotes: ["pls email c***@ex.com"],
      },
    ],
  },
  {
    dataset: "products",
    table: "products",
    field: "product_name",
    rows: 80,
    buckets: [
      {
        info_type: "PERSON_NAME",
        findings: 35,
        likelihood: "LIKELY",
        quotes: ["Ada Lovelace kit", "Grace Hopper case"],
      },
    ],
  },
  {
    dataset: "customers",
    table: "customers",
    field: "contact",
    rows: 100,
    buckets: [
      {
        info_type: "EMAIL_ADDRESS",
        findings: 40,
        likelihood: "LIKELY",
        quotes: ["desk***@corp.example"],
      },
      {
        info_type: "PHONE_NUMBER",
        findings: 45,
        likelihood: "LIKELY",
        quotes: ["+44 7700 900***"],
      },
    ],
  },
  {
    dataset: "customers",
    table: "customers",
    field: "email_stable",
    rows: 1000,
    buckets: [
      {
        info_type: "EMAIL_ADDRESS",
        findings: 90,
        likelihood: "VERY_LIKELY",
        quotes: ["stable***@billing.example"],
      },
    ],
  },
  {
    dataset: "customers",
    table: "customers",
    field: "legacy_id",
    rows: 1000,
    buckets: [
      {
        info_type: "UK_NATIONAL_INSURANCE_NUMBER",
        findings: 80,
        likelihood: "VERY_LIKELY",
        quotes: ["QQ 12 34 56 C"],
      },
    ],
  },
  {
    dataset: "kyc",
    table: "subjects",
    field: "national_id",
    rows: 1000,
    buckets: [
      {
        info_type: "EMAIL_ADDRESS",
        findings: 85,
        likelihood: "VERY_LIKELY",
        quotes: ["kyc***@mail.example"],
      },
    ],
  },
  {
    dataset: "customers",
    table: "customers",
    field: "notes_free",
    rows: 1000,
    buckets: [
      {
        info_type: "EMAIL_ADDRESS",
        findings: 80,
        likelihood: "POSSIBLE",
        quotes: ["cc jane***@ex.com"],
      },
    ],
  },
  {
    dataset: "customers",
    table: "customers",
    field: "mobile",
    rows: 800,
    buckets: [
      {
        info_type: "PHONE_NUMBER",
        findings: 70,
        likelihood: "VERY_LIKELY",
        quotes: ["+1 202 555 01**"],
      },
    ],
  },
  {
    dataset: "raw",
    table: "events",
    field: "widget_token",
    rows: 500,
    buckets: [
      {
        info_type: "CUSTOM_WIDGET_TOKEN",
        findings: 50,
        likelihood: "LIKELY",
        quotes: ["wgt_8f3a**"],
      },
    ],
  },
  {
    dataset: "finance",
    table: "cards",
    field: "site_id",
    rows: 800,
    buckets: [
      {
        info_type: "CREDIT_CARD_NUMBER",
        findings: 70,
        likelihood: "VERY_LIKELY",
        quotes: ["4111 **** **** 1111"],
      },
    ],
  },
];

export const PREV_FINDING_SPECS: FindingSpec[] = [
  {
    dataset: "customers",
    table: "customers",
    field: "email_stable",
    rows: 1000,
    buckets: [
      {
        info_type: "EMAIL_ADDRESS",
        findings: 90,
        likelihood: "VERY_LIKELY",
        quotes: ["stable***@billing.example"],
      },
    ],
  },
  {
    dataset: "customers",
    table: "customers",
    field: "legacy_id",
    rows: 1000,
    buckets: [
      {
        info_type: "EMAIL_ADDRESS",
        findings: 88,
        likelihood: "VERY_LIKELY",
        quotes: ["old***@billing.example"],
      },
    ],
  },
  {
    dataset: "kyc",
    table: "subjects",
    field: "national_id",
    rows: 1000,
    buckets: [
      {
        info_type: "UK_NATIONAL_INSURANCE_NUMBER",
        findings: 82,
        likelihood: "VERY_LIKELY",
        quotes: ["AB 12 34 56 C"],
      },
    ],
  },
  {
    dataset: "customers",
    table: "customers",
    field: "retired_email",
    rows: 1000,
    buckets: [
      {
        info_type: "EMAIL_ADDRESS",
        findings: 91,
        likelihood: "VERY_LIKELY",
        quotes: ["gone***@old.example"],
      },
    ],
  },
  {
    dataset: "customers",
    table: "customers",
    field: "notes_free",
    rows: 1000,
    buckets: [
      {
        info_type: "EMAIL_ADDRESS",
        findings: 80,
        likelihood: "POSSIBLE",
        quotes: ["cc jane***@ex.com"],
      },
    ],
  },
  {
    dataset: "customers",
    table: "customers",
    field: "mobile",
    rows: 800,
    buckets: [
      {
        info_type: "PHONE_NUMBER",
        findings: 70,
        likelihood: "VERY_LIKELY",
        quotes: ["+1 202 555 01**"],
      },
    ],
  },
];

export function expandFindings(
  specs: FindingSpec[],
  jobId: string,
  createTime: string,
): DlpFinding[] {
  const rows: DlpFinding[] = [];
  for (const spec of specs) {
    for (const bucket of spec.buckets) {
      for (let i = 0; i < bucket.findings; i++) {
        const quote =
          bucket.quotes && i < bucket.quotes.length ? bucket.quotes[i] : null;
        rows.push({
          job_id: jobId,
          create_time: createTime,
          project_id: PROJECT,
          dataset_id: spec.dataset,
          table_id: spec.table,
          field_name: spec.field,
          info_type: bucket.info_type,
          likelihood: bucket.likelihood,
          quote,
          quote_hash: quote ? sha256Hex(quote) : null,
          rows_inspected: spec.rows,
        });
      }
    }
  }
  return rows;
}

export function seedDecisions(fingerprints: {
  fqn: string;
  dlp: number;
  value: number;
  dlp_payload: ApprovedDecision["last_dlp_payload"];
  value_payload: ApprovedDecision["last_value_payload"];
  scan_id: string;
}[]): ApprovedDecision[] {
  const byFqn = new Map(fingerprints.map((f) => [f.fqn, f]));
  const row = (
    fqn: string,
    rest: Omit<
      ApprovedDecision,
      | "column_fqn"
      | "last_dlp_fingerprint"
      | "last_value_fingerprint"
      | "last_dlp_payload"
      | "last_value_payload"
      | "last_confirmed_scan_id"
      | "taxonomy_version"
    >,
  ): ApprovedDecision => {
    const fp = byFqn.get(fqn);
    return {
      column_fqn: fqn,
      taxonomy_version: "v1",
      last_confirmed_scan_id: fp?.scan_id ?? SCAN_PREV,
      last_dlp_fingerprint: fp?.dlp ?? null,
      last_value_fingerprint: fp?.value ?? null,
      last_dlp_payload: fp?.dlp_payload ?? null,
      last_value_payload: fp?.value_payload ?? null,
      ...rest,
    };
  };

  return [
    row("myproj.customers.customers.email_stable", {
      term_id: "pii.customer.email",
      policy_tag_resource: tag("customer_email"),
      status: "approved",
      rejected_term_id: null,
      lock_policy: "lock",
      approved_by: "ada@myproj",
      approved_at: "2026-07-02T11:00:00Z",
      notes: "Confirmed billing email.",
      do_not_ask_until: null,
    }),
    row("myproj.customers.customers.legacy_id", {
      term_id: "pii.customer.email",
      policy_tag_resource: tag("customer_email"),
      status: "approved",
      rejected_term_id: null,
      lock_policy: "lock",
      approved_by: "ada@myproj",
      approved_at: "2026-06-10T11:00:00Z",
      notes: "Originally classified as email.",
      do_not_ask_until: null,
    }),
    row("myproj.kyc.subjects.national_id", {
      term_id: "pii.customer.national_id",
      policy_tag_resource: tag("customer_national_id"),
      status: "approved",
      rejected_term_id: null,
      lock_policy: "lock",
      approved_by: "ada@myproj",
      approved_at: "2026-05-20T11:00:00Z",
      notes: "KYC national id.",
      do_not_ask_until: null,
    }),
    row("myproj.customers.customers.retired_email", {
      term_id: "pii.customer.email",
      policy_tag_resource: tag("customer_email"),
      status: "approved",
      rejected_term_id: null,
      lock_policy: "lock",
      approved_by: "ada@myproj",
      approved_at: "2026-04-01T11:00:00Z",
      notes: "Was a live email column.",
      do_not_ask_until: null,
    }),
    row("myproj.customers.customers.notes_free", {
      term_id: null,
      policy_tag_resource: null,
      status: "rejected",
      rejected_term_id: "pii.customer.email",
      lock_policy: "lock",
      approved_by: "ada@myproj",
      approved_at: "2026-08-02T11:00:00Z",
      notes: "Occasional emails in notes are not a column class.",
      do_not_ask_until: "2026-09-15T00:00:00Z",
    }),
    row("myproj.customers.customers.mobile", {
      term_id: "pii.customer.phone",
      policy_tag_resource: tag("customer_phone"),
      status: "approved",
      rejected_term_id: null,
      lock_policy: "lock",
      approved_by: "ada@myproj",
      approved_at: "2026-03-18T11:00:00Z",
      notes: "Approved as phone. Someone attached the email tag in BigQuery.",
      do_not_ask_until: null,
    }),
  ];
}

function meta(
  dataset: string,
  table: string,
  column: string,
  fieldPath: string,
  dataType: string,
  description: string,
  existing: string | null,
  ndv: number,
  nullRate: number,
  lengthP50: number,
  rowCount: number,
): ColumnMetadata {
  return {
    project_id: PROJECT,
    dataset_id: dataset,
    table_id: table,
    column_name: column,
    field_path: fieldPath,
    data_type: dataType,
    description,
    is_nullable: true,
    existing_policy_tag: existing,
    approx_ndv: ndv,
    null_rate: nullRate,
    length_p50: lengthP50,
    row_count: rowCount,
  };
}
