-- Build per-column profiles for a scan.
-- Parameter: scan_id (defaults to the latest dlp_findings.job_id).
-- Columns with zero DLP findings are still profiled from column_metadata
-- so name rules can fire on site ids / exchange codes.

DECLARE scan_id STRING DEFAULT (
  SELECT job_id
  FROM gov_dlp.dlp_findings
  QUALIFY ROW_NUMBER() OVER (ORDER BY create_time DESC) = 1
);

DECLARE profiled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP();

DELETE FROM gov_dlp.column_profiles WHERE scan_id = scan_id;

INSERT INTO gov_dlp.column_profiles
WITH
keys AS (
  SELECT DISTINCT
    project_id, dataset_id, table_id, field_name
  FROM gov_dlp.dlp_findings
  WHERE job_id = scan_id
  UNION DISTINCT
  SELECT
    project_id, dataset_id, table_id,
    COALESCE(field_path, column_name) AS field_name
  FROM gov_dlp.column_metadata
),
scan_findings AS (
  SELECT *
  FROM gov_dlp.dlp_findings
  WHERE job_id = scan_id
),
hist AS (
  SELECT
    k.project_id,
    k.dataset_id,
    k.table_id,
    k.field_name,
    f.info_type,
    COUNTIF(f.info_type IS NOT NULL) AS findings,
    COUNTIF(f.likelihood = 'VERY_LIKELY') AS very_likely,
    COUNTIF(f.likelihood = 'LIKELY') AS likely,
    COUNTIF(f.likelihood = 'POSSIBLE') AS possible
  FROM keys k
  LEFT JOIN scan_findings f
    ON f.project_id = k.project_id
   AND f.dataset_id = k.dataset_id
   AND f.table_id = k.table_id
   AND f.field_name = k.field_name
  WHERE f.info_type IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5
),
hist_arr AS (
  SELECT
    project_id, dataset_id, table_id, field_name,
    ARRAY_AGG(
      STRUCT(info_type, findings, very_likely, likely, possible)
      ORDER BY findings DESC, info_type
    ) AS info_type_histogram,
    SUM(findings) AS findings_total
  FROM hist
  GROUP BY 1, 2, 3, 4
),
quotes AS (
  SELECT
    project_id, dataset_id, table_id, field_name,
    ARRAY_AGG(quote IGNORE NULLS ORDER BY lik_rank LIMIT 5) AS sample_quotes,
    ARRAY_AGG(quote_hash IGNORE NULLS LIMIT 20) AS sample_value_hashes,
    ANY_VALUE(rows_inspected) AS rows_from_findings
  FROM (
    SELECT
      f.*,
      CASE f.likelihood
        WHEN 'VERY_LIKELY' THEN 1
        WHEN 'LIKELY' THEN 2
        WHEN 'POSSIBLE' THEN 3
        WHEN 'UNLIKELY' THEN 4
        ELSE 5
      END AS lik_rank
    FROM scan_findings f
    WHERE f.quote IS NOT NULL OR f.quote_hash IS NOT NULL
  )
  GROUP BY 1, 2, 3, 4
),
joined AS (
  SELECT
    k.project_id,
    k.dataset_id,
    k.table_id,
    k.field_name,
    gov_dlp.column_fqn(k.project_id, k.dataset_id, k.table_id, k.field_name) AS column_fqn,
    m.data_type,
    m.description AS column_description,
    m.existing_policy_tag,
    gov_dlp.normalize_column_name(k.field_name) AS name_normalized,
    gov_dlp.field_path_suffix(k.field_name) AS name_suffix,
    COALESCE(q.rows_from_findings, m.row_count) AS rows_inspected,
    COALESCE(h.findings_total, 0) AS findings_total,
    h.info_type_histogram,
    m.approx_ndv,
    m.null_rate,
    m.length_p50,
    q.sample_quotes,
    q.sample_value_hashes
  FROM keys k
  LEFT JOIN hist_arr h
    ON h.project_id = k.project_id
   AND h.dataset_id = k.dataset_id
   AND h.table_id = k.table_id
   AND h.field_name = k.field_name
  LEFT JOIN quotes q
    ON q.project_id = k.project_id
   AND q.dataset_id = k.dataset_id
   AND q.table_id = k.table_id
   AND q.field_name = k.field_name
  LEFT JOIN gov_dlp.column_metadata m
    ON m.project_id = k.project_id
   AND m.dataset_id = k.dataset_id
   AND m.table_id = k.table_id
   AND (m.field_path = k.field_name OR m.column_name = k.field_name)
),
shaped AS (
  SELECT
    j.*,
    SAFE_DIVIDE(j.findings_total, j.rows_inspected) AS hit_rate,
    IF(j.findings_total > 0, j.info_type_histogram[SAFE_OFFSET(0)].info_type, NULL)
      AS dominant_info_type,
    SAFE_DIVIDE(
      IF(j.findings_total > 0, j.info_type_histogram[SAFE_OFFSET(0)].findings, NULL),
      j.findings_total
    ) AS dominant_share,
    EXISTS (
      SELECT 1
      FROM UNNEST(j.info_type_histogram) h WITH OFFSET off
      WHERE off > 0
        AND j.findings_total > 0
        AND h.findings / j.findings_total >= 0.20
    ) AS is_mixed
  FROM joined j
),
payloads AS (
  SELECT
    s.*,
    TO_JSON(STRUCT(
      s.dominant_info_type,
      s.is_mixed,
      ROUND(s.dominant_share, 2) AS dominant_share,
      gov_dlp.hit_band(s.hit_rate) AS hit_band,
      (
        SELECT ARRAY_AGG(STRUCT(x.info_type, x.share) ORDER BY x.findings DESC, x.info_type)
        FROM (
          SELECT
            h.info_type,
            h.findings,
            ROUND(SAFE_DIVIDE(h.findings, s.findings_total), 2) AS share
          FROM UNNEST(s.info_type_histogram) h
          ORDER BY h.findings DESC, h.info_type
          LIMIT 3
        ) x
      ) AS top_info_types
    )) AS dlp_payload,
    TO_JSON(STRUCT(
      gov_dlp.hit_band(s.null_rate) AS null_rate_band,
      gov_dlp.ndv_band(s.approx_ndv) AS ndv_band,
      s.length_p50,
      (
        SELECT ARRAY_AGG(h ORDER BY h)
        FROM UNNEST(s.sample_value_hashes) h
        LIMIT 20
      ) AS top_value_hashes
    )) AS value_payload
  FROM shaped s
)
SELECT
  CONCAT('prof_', scan_id, '_', REGEXP_REPLACE(column_fqn, r'[^a-zA-Z0-9]+', '_')) AS profile_id,
  scan_id,
  profiled_at,
  project_id,
  dataset_id,
  table_id,
  field_name,
  column_fqn,
  data_type,
  column_description,
  existing_policy_tag,
  name_normalized,
  name_suffix,
  rows_inspected,
  findings_total,
  hit_rate,
  info_type_histogram,
  dominant_info_type,
  dominant_share,
  is_mixed,
  IFNULL(sample_quotes, CAST([] AS ARRAY<STRING>)),
  IFNULL(sample_value_hashes, CAST([] AS ARRAY<STRING>)),
  approx_ndv,
  null_rate,
  length_p50,
  dlp_payload,
  value_payload,
  FARM_FINGERPRINT(TO_JSON_STRING(dlp_payload)) AS dlp_fingerprint,
  FARM_FINGERPRINT(TO_JSON_STRING(value_payload)) AS value_fingerprint,
  CAST(NULL AS STRING) AS proposed_term_id,
  CAST(NULL AS STRING) AS name_rule_term_id,
  CAST(NULL AS STRING) AS dlp_term_id,
  CAST(NULL AS STRING) AS proposal_source,
  CAST(NULL AS STRING) AS proposal_rule_id,
  CAST(NULL AS STRING) AS proposal_reason,
  CAST(NULL AS BOOL) AS shape_ok
FROM payloads;
