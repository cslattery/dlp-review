-- Compare the latest profile to the last steward-approved classification.
-- Do not insert a new open event if one already exists for the FQN.
-- Respect do_not_ask_until unless this is a material sensitivity upgrade.
-- A rescan is a drift check, not a retag.

DECLARE scan_id STRING DEFAULT (
  SELECT scan_id
  FROM gov_dlp.column_profiles
  QUALIFY ROW_NUMBER() OVER (ORDER BY profiled_at DESC) = 1
);

INSERT INTO gov_dlp.drift_events
WITH
latest AS (
  SELECT *
  FROM gov_dlp.column_profiles
  WHERE scan_id = scan_id
),
prev AS (
  SELECT p.*
  FROM gov_dlp.column_profiles p
  JOIN latest l ON l.column_fqn = p.column_fqn
  WHERE p.scan_id != scan_id
  QUALIFY ROW_NUMBER() OVER (PARTITION BY p.column_fqn ORDER BY p.profiled_at DESC) = 1
),
base AS (
  SELECT
    l.*,
    d.status AS decision_status,
    d.term_id AS approved_term_id,
    d.rejected_term_id,
    d.policy_tag_resource AS approved_policy_tag,
    d.last_dlp_fingerprint,
    d.last_value_fingerprint,
    d.do_not_ask_until,
    prev.dominant_info_type AS prev_dominant_info_type,
    prev.dominant_share AS prev_dominant_share,
    prev.hit_rate AS prev_hit_rate,
    prev.is_mixed AS prev_is_mixed,
    prev.dlp_fingerprint AS prev_profile_dlp_fp,
    prev.value_fingerprint AS prev_profile_value_fp,
    prev.null_rate AS prev_null_rate,
    prev.approx_ndv AS prev_approx_ndv,
    prev.length_p50 AS prev_length_p50,
    prev.sample_value_hashes AS prev_hashes,
    COALESCE(d.last_dlp_fingerprint, prev.dlp_fingerprint) AS baseline_dlp_fp,
    COALESCE(d.last_value_fingerprint, prev.value_fingerprint) AS baseline_value_fp,
    pt.sensitivity_rank AS proposed_rank,
    at.sensitivity_rank AS approved_rank
  FROM latest l
  LEFT JOIN gov_dlp.approved_decisions d ON d.column_fqn = l.column_fqn
  LEFT JOIN prev ON prev.column_fqn = l.column_fqn
  LEFT JOIN gov_dlp.term_catalog pt ON pt.term_id = l.proposed_term_id
  LEFT JOIN gov_dlp.term_catalog at ON at.term_id = d.term_id
),
flagged AS (
  SELECT
    b.*,
    (
      (IFNULL(b.prev_dominant_info_type, '') != IFNULL(b.dominant_info_type, '')
        AND IFNULL(b.dominant_share, 0) >= 0.20)
      OR (
        b.prev_hit_rate IS NOT NULL AND b.hit_rate IS NOT NULL AND (
          (b.prev_hit_rate > 0 AND (b.hit_rate / b.prev_hit_rate >= 2
                                 OR b.prev_hit_rate / b.hit_rate >= 2))
          OR ((b.prev_hit_rate < 0.01) != (b.hit_rate < 0.01))
          OR ((b.prev_hit_rate < 0.10) != (b.hit_rate < 0.10))
        )
      )
      OR (b.prev_is_mixed IS NOT NULL AND b.prev_is_mixed != b.is_mixed)
      OR (b.proposed_rank IS NOT NULL AND b.approved_rank IS NOT NULL
          AND b.proposed_rank > b.approved_rank)
      OR (b.baseline_dlp_fp IS NOT NULL AND b.dlp_fingerprint != b.baseline_dlp_fp)
      OR (
        b.baseline_value_fp IS NOT NULL
        AND b.value_fingerprint != b.baseline_value_fp
        AND (
          gov_dlp.hit_band(b.prev_null_rate) != gov_dlp.hit_band(b.null_rate)
          OR gov_dlp.ndv_band(b.prev_approx_ndv) != gov_dlp.ndv_band(b.approx_ndv)
          OR IFNULL(b.prev_length_p50, -1) != IFNULL(b.length_p50, -1)
          OR (
            SELECT SAFE_DIVIDE(
              (SELECT COUNT(*) FROM UNNEST(b.prev_hashes) h WHERE h IN UNNEST(b.sample_value_hashes)),
              (SELECT COUNT(*) FROM (
                SELECT * FROM UNNEST(b.prev_hashes)
                UNION DISTINCT
                SELECT * FROM UNNEST(b.sample_value_hashes)
              ))
            )
          ) < 0.5
        )
      )
    ) AS material_change
  FROM base b
),
classified AS (
  SELECT
    f.*,
    CASE
      WHEN f.existing_policy_tag IS NOT NULL
       AND f.decision_status = 'approved'
       AND f.approved_policy_tag IS NOT NULL
       AND f.existing_policy_tag != f.approved_policy_tag
        THEN 'SCHEMA_DRIFT'
      WHEN f.proposal_source = 'conflict' THEN 'CONFLICT'
      WHEN f.proposal_source = 'name_rule_shape_mismatch' THEN 'SHAPE_MISMATCH'
      WHEN f.proposal_source = 'mixed' AND f.proposed_term_id IS NULL THEN 'MIXED'
      WHEN f.decision_status IS NULL
       AND f.proposed_term_id IS NOT NULL
       AND f.proposal_source IN ('name_rule', 'name_rule_shape_mismatch')
        THEN 'NAME_RULE_NEW'
      WHEN f.decision_status IS NULL
       AND f.proposed_term_id IS NOT NULL
       AND f.proposal_source = 'dlp_map'
        THEN 'NEW_UNTAGGED'
      WHEN f.decision_status = 'rejected'
       AND f.proposed_term_id = f.rejected_term_id
       AND NOT f.material_change
        THEN 'REJECTED_REPEAT'
      WHEN f.decision_status = 'rejected'
       AND f.proposed_term_id = f.rejected_term_id
       AND f.material_change
        THEN 'NEEDS_REVIEW'
      WHEN f.decision_status = 'approved'
       AND f.approved_term_id = f.proposed_term_id
       AND NOT f.material_change
        THEN 'CONFIRMED'
      WHEN f.decision_status = 'approved'
       AND f.approved_term_id = f.proposed_term_id
       AND f.material_change
        THEN 'NEEDS_REVIEW'
      WHEN f.decision_status = 'approved'
       AND f.proposed_term_id IS NOT NULL
       AND f.approved_term_id != f.proposed_term_id
       AND NOT f.material_change
        THEN 'TAXONOMY_ONLY'
      WHEN f.decision_status = 'approved'
       AND f.proposed_term_id IS NOT NULL
       AND f.approved_term_id != f.proposed_term_id
       AND f.material_change
       AND IFNULL(f.proposed_rank, 0) > IFNULL(f.approved_rank, 0)
        THEN 'TERM_UPGRADE'
      WHEN f.decision_status = 'approved'
       AND f.proposed_term_id IS NOT NULL
       AND f.approved_term_id != f.proposed_term_id
       AND f.material_change
        THEN 'TERM_DOWNGRADE'
      WHEN f.decision_status = 'approved'
       AND f.proposed_term_id IS NULL
       AND f.material_change
       AND f.approved_term_id IS NOT NULL
        THEN 'UNTAG_CANDIDATE'
      ELSE NULL
    END AS event_type
  FROM flagged f
),
statused AS (
  SELECT
    c.*,
    CASE
      WHEN c.event_type = 'CONFIRMED' THEN 'confirmed'
      WHEN c.event_type = 'REJECTED_REPEAT' THEN 'suppressed'
      WHEN c.do_not_ask_until IS NOT NULL
       AND c.do_not_ask_until > CURRENT_TIMESTAMP()
       AND NOT (c.event_type = 'TERM_UPGRADE' AND c.material_change)
        THEN 'suppressed'
      ELSE 'open'
    END AS event_status
  FROM classified c
  WHERE c.event_type IS NOT NULL
)
SELECT
  CONCAT('evt_', scan_id, '_', REGEXP_REPLACE(column_fqn, r'[^a-zA-Z0-9]+', '_')) AS event_id,
  scan_id,
  column_fqn,
  event_type,
  approved_term_id AS previous_term_id,
  proposed_term_id,
  approved_rank AS previous_sensitivity_rank,
  proposed_rank AS proposed_sensitivity_rank,
  baseline_dlp_fp AS previous_dlp_fingerprint,
  dlp_fingerprint AS new_dlp_fingerprint,
  baseline_value_fp AS previous_value_fingerprint,
  value_fingerprint AS new_value_fingerprint,
  material_change,
  existing_policy_tag AS live_policy_tag,
  approved_policy_tag,
  proposal_source,
  event_status AS status,
  CURRENT_TIMESTAMP() AS created_at,
  IF(event_status = 'confirmed', 'system', NULL) AS reviewed_by,
  IF(event_status = 'confirmed', CURRENT_TIMESTAMP(), NULL) AS reviewed_at,
  IF(event_status = 'confirmed',
     'Same approved term; fingerprints not materially changed.',
     CAST(NULL AS STRING)) AS review_notes
FROM statused
WHERE column_fqn NOT IN (
  SELECT column_fqn FROM gov_dlp.drift_events WHERE status = 'open'
);
