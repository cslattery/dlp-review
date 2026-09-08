-- Fresh business-term proposal for each column_profile of a scan.
-- Precedence: name rule (then shape) → DLP map. Conflict when an
-- identifier name rule fights a high-share PII DLP term.
-- An approved FQN is NOT copied onto proposed_term_id — the profiler
-- always emits a fresh proposal so drift can compare.

DECLARE scan_id STRING DEFAULT (
  SELECT scan_id
  FROM gov_dlp.column_profiles
  QUALIFY ROW_NUMBER() OVER (ORDER BY profiled_at DESC) = 1
);

MERGE gov_dlp.column_profiles T
USING (
  WITH
  scoped_rules AS (
    SELECT
      p.profile_id,
      r.*,
      CASE
        WHEN r.match_type = 'exact_normalized'
         AND r.scope_type IN ('dataset', 'table_prefix') THEN 0
        WHEN r.match_type = 'exact_normalized' AND r.scope_type = 'project' THEN 1
        WHEN r.match_type = 'exact_normalized' AND r.scope_type = 'org' THEN 2
        WHEN r.match_type = 'path_suffix' THEN 3
        WHEN r.match_type = 'regex' THEN 4
        ELSE 9
      END AS match_rank,
      CASE r.scope_type
        WHEN 'table_prefix' THEN 0
        WHEN 'dataset' THEN 1
        WHEN 'project' THEN 2
        ELSE 3
      END AS scope_rank
    FROM gov_dlp.column_profiles p
    JOIN gov_dlp.column_name_rules r
      ON r.active
     AND r.allow_auto_propose
    WHERE p.scan_id = scan_id
      AND (
        r.scope_type = 'org'
        OR (r.scope_type = 'project' AND r.scope_value = p.project_id)
        OR (r.scope_type = 'dataset'
            AND r.scope_value = CONCAT(p.project_id, '.', p.dataset_id))
        OR (r.scope_type = 'table_prefix'
            AND STARTS_WITH(
              p.table_id,
              IF(STRPOS(r.scope_value, '.') > 0,
                 ARRAY_REVERSE(SPLIT(r.scope_value, '.'))[SAFE_OFFSET(0)],
                 r.scope_value)
            ))
      )
      AND (
        (r.match_type = 'exact_normalized'
          AND (p.name_normalized = r.pattern OR p.name_suffix = r.pattern))
        OR (r.match_type = 'path_suffix' AND p.name_suffix = r.pattern)
        OR (r.match_type = 'regex' AND REGEXP_CONTAINS(p.name_normalized, r.pattern))
      )
      AND NOT EXISTS (
        SELECT 1
        FROM gov_dlp.column_name_rule_negatives n
        WHERE n.rejected_term_id = r.term_id
          AND n.pattern = p.name_normalized
          AND (
            n.scope_type = 'org'
            OR (n.scope_type = 'project' AND n.scope_value = p.project_id)
            OR (n.scope_type = 'dataset'
                AND n.scope_value = CONCAT(p.project_id, '.', p.dataset_id))
            OR (n.scope_type = 'table_prefix'
                AND STARTS_WITH(
                  p.table_id,
                  IF(STRPOS(n.scope_value, '.') > 0,
                     ARRAY_REVERSE(SPLIT(n.scope_value, '.'))[SAFE_OFFSET(0)],
                     n.scope_value)
                ))
          )
      )
  ),
  best_rule AS (
    SELECT * EXCEPT (rn)
    FROM (
      SELECT
        scoped_rules.*,
        ROW_NUMBER() OVER (
          PARTITION BY profile_id
          ORDER BY match_rank, scope_rank, confidence DESC, rule_id
        ) AS rn
      FROM scoped_rules
    )
    WHERE rn = 1
  ),
  dlp_mapped AS (
    SELECT
      p.profile_id,
      m.term_id AS dlp_term_id
    FROM gov_dlp.column_profiles p
    JOIN gov_dlp.info_type_map m
      ON m.info_type = p.dominant_info_type
    WHERE p.scan_id = scan_id
    QUALIFY ROW_NUMBER() OVER (PARTITION BY p.profile_id ORDER BY m.priority, m.term_id) = 1
  ),
  proposed AS (
    SELECT
      p.profile_id,
      br.rule_id,
      br.term_id AS name_rule_term_id,
      dm.dlp_term_id,
      nt.term_family AS name_family,
      dt.term_family AS dlp_family,
      CASE
        WHEN p.data_type IS NULL
         AND p.approx_ndv IS NULL
         AND p.null_rate IS NULL
         AND p.length_p50 IS NULL THEN NULL
        WHEN nt.term_id IS NULL THEN NULL
        WHEN ARRAY_LENGTH(nt.expected_types) > 0
         AND p.data_type IS NOT NULL
         AND p.data_type NOT IN UNNEST(nt.expected_types) THEN FALSE
        WHEN nt.min_length IS NOT NULL AND p.length_p50 IS NOT NULL
         AND p.length_p50 < nt.min_length THEN FALSE
        WHEN nt.max_length IS NOT NULL AND p.length_p50 IS NOT NULL
         AND p.length_p50 > nt.max_length THEN FALSE
        WHEN nt.min_ndv IS NOT NULL AND p.approx_ndv IS NOT NULL
         AND p.approx_ndv < nt.min_ndv THEN FALSE
        WHEN nt.max_ndv IS NOT NULL AND p.approx_ndv IS NOT NULL
         AND p.approx_ndv > nt.max_ndv THEN FALSE
        WHEN nt.max_null_rate IS NOT NULL AND p.null_rate IS NOT NULL
         AND p.null_rate > nt.max_null_rate THEN FALSE
        ELSE TRUE
      END AS shape_ok,
      p.is_mixed,
      p.hit_rate,
      p.dominant_info_type,
      p.dominant_share
    FROM gov_dlp.column_profiles p
    LEFT JOIN best_rule br ON br.profile_id = p.profile_id
    LEFT JOIN dlp_mapped dm ON dm.profile_id = p.profile_id
    LEFT JOIN gov_dlp.term_catalog nt ON nt.term_id = br.term_id
    LEFT JOIN gov_dlp.term_catalog dt ON dt.term_id = dm.dlp_term_id
    WHERE p.scan_id = scan_id
  ),
  decided AS (
    SELECT
      profile_id,
      name_rule_term_id,
      dlp_term_id,
      rule_id,
      shape_ok,
      CASE
        WHEN name_rule_term_id IS NOT NULL
         AND name_family = 'identifier'
         AND dlp_family = 'pii'
         AND IFNULL(dominant_share, 0) >= 0.5
         AND IFNULL(hit_rate, 0) >= 0.01
          THEN dlp_term_id
        WHEN name_rule_term_id IS NOT NULL THEN name_rule_term_id
        WHEN is_mixed THEN NULL
        WHEN hit_rate IS NOT NULL AND hit_rate < 0.01 THEN NULL
        WHEN dlp_term_id IS NOT NULL THEN dlp_term_id
        ELSE NULL
      END AS proposed_term_id,
      CASE
        WHEN name_rule_term_id IS NOT NULL
         AND name_family = 'identifier'
         AND dlp_family = 'pii'
         AND IFNULL(dominant_share, 0) >= 0.5
         AND IFNULL(hit_rate, 0) >= 0.01
          THEN 'conflict'
        WHEN name_rule_term_id IS NOT NULL AND shape_ok IS FALSE
          THEN 'name_rule_shape_mismatch'
        WHEN name_rule_term_id IS NOT NULL THEN 'name_rule'
        WHEN is_mixed THEN 'mixed'
        WHEN hit_rate IS NOT NULL AND hit_rate < 0.01 THEN 'low_hit_rate'
        WHEN dlp_term_id IS NOT NULL THEN 'dlp_map'
        ELSE 'unmapped'
      END AS proposal_source,
      CASE
        WHEN name_rule_term_id IS NOT NULL
         AND name_family = 'identifier'
         AND dlp_family = 'pii'
         AND IFNULL(dominant_share, 0) >= 0.5
         AND IFNULL(hit_rate, 0) >= 0.01
          THEN CONCAT('Name rule ', IFNULL(rule_id, ''), ' suggests ', name_rule_term_id,
                      ' but DLP maps ', IFNULL(dominant_info_type, ''), ' → ', dlp_term_id,
                      '. Safer default is the DLP term.')
        WHEN name_rule_term_id IS NOT NULL AND shape_ok IS FALSE
          THEN CONCAT('Name rule ', IFNULL(rule_id, ''), ' suggests ', name_rule_term_id,
                      ' but the value sketch is outside term_catalog bounds.')
        WHEN name_rule_term_id IS NOT NULL
          THEN CONCAT('Name rule ', IFNULL(rule_id, ''), ' suggests ', name_rule_term_id,
                      '. Name rules never apply tags.')
        WHEN is_mixed THEN 'Multiple infoTypes each hold ≥20% of findings.'
        WHEN hit_rate IS NOT NULL AND hit_rate < 0.01
          THEN 'Hit rate below 1%. Treating as noise, not a column class.'
        WHEN dlp_term_id IS NOT NULL
          THEN CONCAT('Dominant infoType ', IFNULL(dominant_info_type, ''), ' maps to ', dlp_term_id)
        WHEN dominant_info_type IS NOT NULL
          THEN CONCAT('Dominant infoType ', dominant_info_type, ' has no info_type_map row.')
        ELSE 'No name-rule hit and no DLP findings to map.'
      END AS proposal_reason
    FROM proposed
  )
  SELECT * FROM decided
) S
ON T.profile_id = S.profile_id
WHEN MATCHED THEN UPDATE SET
  proposed_term_id = S.proposed_term_id,
  name_rule_term_id = S.name_rule_term_id,
  dlp_term_id = S.dlp_term_id,
  proposal_source = S.proposal_source,
  proposal_rule_id = S.rule_id,
  proposal_reason = S.proposal_reason,
  shape_ok = S.shape_ok;
