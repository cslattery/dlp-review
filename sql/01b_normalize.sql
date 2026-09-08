-- Name normalisation UDFs. Site ids / exchange codes are matched on
-- normalised names — never with a custom DLP regex on the values.

CREATE OR REPLACE FUNCTION gov_dlp.normalize_column_name(raw STRING)
RETURNS STRING
LANGUAGE js AS r"""
  if (raw === null || raw === undefined) return null;
  var s = String(raw).trim();
  s = s.replace(/[-.\s]+/g, '_');
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  s = s.toLowerCase();
  s = s.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return s;
""";

-- Last 1–2 dotted segments, each normalised, joined with `_`.
-- customer.site.id → site_id
CREATE OR REPLACE FUNCTION gov_dlp.field_path_suffix(field_name STRING)
RETURNS STRING
LANGUAGE js AS r"""
  if (!field_name) return '';
  var segs = String(field_name).split('.').map(function (p) {
    return p.trim();
  }).filter(Boolean);
  var take = segs.slice(-2);
  function norm(raw) {
    if (raw === null || raw === undefined) return '';
    var s = String(raw).trim();
    s = s.replace(/[-.\s]+/g, '_');
    s = s.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
    s = s.toLowerCase();
    s = s.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return s;
  }
  return take.map(norm).join('_');
""";

CREATE OR REPLACE FUNCTION gov_dlp.column_fqn(
  project_id STRING, dataset_id STRING, table_id STRING, field_name STRING
)
RETURNS STRING AS (
  CONCAT(project_id, '.', dataset_id, '.', table_id, '.', field_name)
);

CREATE OR REPLACE FUNCTION gov_dlp.hit_band(rate FLOAT64)
RETURNS STRING AS (
  CASE
    WHEN rate IS NULL THEN NULL
    WHEN rate < 0.01 THEN 'lt_1pct'
    WHEN rate < 0.10 THEN '1_10pct'
    WHEN rate < 0.50 THEN '10_50pct'
    ELSE 'ge_50pct'
  END
);

CREATE OR REPLACE FUNCTION gov_dlp.ndv_band(ndv INT64)
RETURNS STRING AS (
  CASE
    WHEN ndv IS NULL THEN NULL
    WHEN ndv <= 1 THEN '1'
    WHEN ndv <= 10 THEN '2_10'
    WHEN ndv <= 100 THEN '11_100'
    WHEN ndv <= 1000 THEN '101_1k'
    ELSE '1k_plus'
  END
);
