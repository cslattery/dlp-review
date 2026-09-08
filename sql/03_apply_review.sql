-- Parameterized steward actions. Policy tags are applied ONLY from an
-- approved decision (see the stub apply-tag API). These statements never
-- call tables.update.
--
-- Parameters used below:
--   @event_id, @term_id, @lock_policy, @notes, @actor, @never_suggest

-- ---------------------------------------------------------------------------
-- Approve the proposed term (or @term_id override)
-- ---------------------------------------------------------------------------
BEGIN
  DECLARE v_fqn STRING;
  DECLARE v_scan STRING;
  DECLARE v_term STRING;
  DECLARE v_tag STRING;
  DECLARE v_prev STRING;
  DECLARE v_dlp INT64;
  DECLARE v_val INT64;

  SET (v_fqn, v_scan, v_term, v_prev) = (
    SELECT AS STRUCT column_fqn, scan_id,
           COALESCE(@term_id, proposed_term_id), previous_term_id
    FROM gov_dlp.drift_events
    WHERE event_id = @event_id
  );

  SET (v_tag, v_dlp, v_val) = (
    SELECT AS STRUCT
      t.policy_tag_resource,
      p.dlp_fingerprint,
      p.value_fingerprint
    FROM gov_dlp.term_catalog t
    LEFT JOIN gov_dlp.column_profiles p
      ON p.column_fqn = v_fqn AND p.scan_id = v_scan
    WHERE t.term_id = v_term
  );

  MERGE gov_dlp.approved_decisions D
  USING (SELECT v_fqn AS column_fqn) S
  ON D.column_fqn = S.column_fqn
  WHEN MATCHED THEN UPDATE SET
    term_id = v_term,
    policy_tag_resource = v_tag,
    status = 'approved',
    rejected_term_id = NULL,
    lock_policy = COALESCE(@lock_policy, 'lock'),
    approved_by = @actor,
    approved_at = CURRENT_TIMESTAMP(),
    last_confirmed_scan_id = v_scan,
    last_dlp_fingerprint = v_dlp,
    last_value_fingerprint = v_val,
    notes = @notes,
    do_not_ask_until = NULL
  WHEN NOT MATCHED THEN INSERT (
    column_fqn, term_id, policy_tag_resource, status, rejected_term_id,
    lock_policy, approved_by, approved_at, taxonomy_version,
    last_confirmed_scan_id, last_dlp_fingerprint, last_value_fingerprint,
    notes, do_not_ask_until
  ) VALUES (
    v_fqn, v_term, v_tag, 'approved', NULL,
    COALESCE(@lock_policy, 'lock'), @actor, CURRENT_TIMESTAMP(), 'v1',
    v_scan, v_dlp, v_val, @notes, NULL
  );

  UPDATE gov_dlp.drift_events
  SET status = 'approved',
      reviewed_by = @actor,
      reviewed_at = CURRENT_TIMESTAMP(),
      review_notes = @notes
  WHERE event_id = @event_id;

  INSERT INTO gov_dlp.review_audit (
    audit_id, event_id, column_fqn, action, actor, at,
    previous_term_id, new_term_id, notes, details
  )
  VALUES (
    GENERATE_UUID(), @event_id, v_fqn,
    IF(@term_id IS NOT NULL AND @term_id != v_prev, 'override', 'approve'),
    @actor, CURRENT_TIMESTAMP(), v_prev, v_term, @notes,
    TO_JSON(STRUCT(COALESCE(@lock_policy, 'lock') AS lock_policy, v_tag AS policy_tag_resource))
  );
END;

-- ---------------------------------------------------------------------------
-- Reject the proposed term. Optionally write a dataset-scoped negative.
-- do_not_ask_until = NOW() + 7 days.
-- ---------------------------------------------------------------------------
BEGIN
  DECLARE v_fqn STRING;
  DECLARE v_scan STRING;
  DECLARE v_term STRING;
  DECLARE v_name STRING;
  DECLARE v_project STRING;
  DECLARE v_dataset STRING;

  SET (v_fqn, v_scan, v_term) = (
    SELECT AS STRUCT column_fqn, scan_id, proposed_term_id
    FROM gov_dlp.drift_events WHERE event_id = @event_id
  );
  SET (v_name, v_project, v_dataset) = (
    SELECT AS STRUCT name_normalized, project_id, dataset_id
    FROM gov_dlp.column_profiles
    WHERE column_fqn = v_fqn AND scan_id = v_scan
  );

  MERGE gov_dlp.approved_decisions D
  USING (SELECT v_fqn AS column_fqn) S
  ON D.column_fqn = S.column_fqn
  WHEN MATCHED THEN UPDATE SET
    status = 'rejected',
    rejected_term_id = v_term,
    approved_by = @actor,
    approved_at = CURRENT_TIMESTAMP(),
    notes = @notes,
    do_not_ask_until = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  WHEN NOT MATCHED THEN INSERT (
    column_fqn, term_id, policy_tag_resource, status, rejected_term_id,
    lock_policy, approved_by, approved_at, taxonomy_version,
    last_confirmed_scan_id, notes, do_not_ask_until
  ) VALUES (
    v_fqn, NULL, NULL, 'rejected', v_term,
    'lock', @actor, CURRENT_TIMESTAMP(), 'v1',
    v_scan, @notes, TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  );

  UPDATE gov_dlp.drift_events
  SET status = 'rejected',
      reviewed_by = @actor,
      reviewed_at = CURRENT_TIMESTAMP(),
      review_notes = @notes
  WHERE event_id = @event_id;

  IF IFNULL(@never_suggest, FALSE) THEN
    INSERT INTO gov_dlp.column_name_rule_negatives (
      negative_id, pattern, scope_type, scope_value, rejected_term_id,
      column_fqn, notes, created_at
    )
    VALUES (
      CONCAT('neg_', GENERATE_UUID()),
      v_name, 'dataset', CONCAT(v_project, '.', v_dataset),
      v_term, v_fqn, @notes, CURRENT_TIMESTAMP()
    );
  END IF;

  INSERT INTO gov_dlp.review_audit (
    audit_id, event_id, column_fqn, action, actor, at,
    previous_term_id, new_term_id, notes, details
  )
  VALUES (
    GENERATE_UUID(), @event_id, v_fqn, 'reject', @actor, CURRENT_TIMESTAMP(),
    v_term, NULL, @notes,
    TO_JSON(STRUCT(IFNULL(@never_suggest, FALSE) AS never_suggest))
  );
END;

-- ---------------------------------------------------------------------------
-- Approve untag
-- ---------------------------------------------------------------------------
BEGIN
  DECLARE v_fqn STRING;
  DECLARE v_scan STRING;
  DECLARE v_prev STRING;

  SET (v_fqn, v_scan, v_prev) = (
    SELECT AS STRUCT column_fqn, scan_id, previous_term_id
    FROM gov_dlp.drift_events WHERE event_id = @event_id
  );

  MERGE gov_dlp.approved_decisions D
  USING (SELECT v_fqn AS column_fqn) S
  ON D.column_fqn = S.column_fqn
  WHEN MATCHED THEN UPDATE SET
    term_id = NULL,
    policy_tag_resource = NULL,
    status = 'untag_approved',
    rejected_term_id = v_prev,
    lock_policy = 'allow_untag',
    approved_by = @actor,
    approved_at = CURRENT_TIMESTAMP(),
    notes = @notes,
    do_not_ask_until = NULL
  WHEN NOT MATCHED THEN INSERT (
    column_fqn, term_id, policy_tag_resource, status, rejected_term_id,
    lock_policy, approved_by, approved_at, taxonomy_version, notes
  ) VALUES (
    v_fqn, NULL, NULL, 'untag_approved', v_prev,
    'allow_untag', @actor, CURRENT_TIMESTAMP(), 'v1', @notes
  );

  UPDATE gov_dlp.drift_events
  SET status = 'approved',
      reviewed_by = @actor,
      reviewed_at = CURRENT_TIMESTAMP(),
      review_notes = @notes
  WHERE event_id = @event_id;

  INSERT INTO gov_dlp.review_audit (
    audit_id, event_id, column_fqn, action, actor, at,
    previous_term_id, new_term_id, notes, details
  )
  VALUES (
    GENERATE_UUID(), @event_id, v_fqn, 'untag', @actor, CURRENT_TIMESTAMP(),
    v_prev, NULL, @notes, TO_JSON(STRUCT('untag_approved' AS status))
  );
END;

-- ---------------------------------------------------------------------------
-- Set lock_policy on the existing decision
-- ---------------------------------------------------------------------------
UPDATE gov_dlp.approved_decisions
SET lock_policy = @lock_policy,
    notes = COALESCE(@notes, notes)
WHERE column_fqn = (
  SELECT column_fqn FROM gov_dlp.drift_events WHERE event_id = @event_id
);

INSERT INTO gov_dlp.review_audit (
  audit_id, event_id, column_fqn, action, actor, at,
  previous_term_id, new_term_id, notes, details
)
SELECT
  GENERATE_UUID(), @event_id, column_fqn, 'set_lock_policy', @actor,
  CURRENT_TIMESTAMP(), previous_term_id, previous_term_id, @notes,
  TO_JSON(STRUCT(@lock_policy AS lock_policy))
FROM gov_dlp.drift_events
WHERE event_id = @event_id;

-- ---------------------------------------------------------------------------
-- CONFIRMED helper: refresh last_confirmed_scan_id + fingerprints
-- ---------------------------------------------------------------------------
UPDATE gov_dlp.approved_decisions d
SET last_confirmed_scan_id = p.scan_id,
    last_dlp_fingerprint = p.dlp_fingerprint,
    last_value_fingerprint = p.value_fingerprint
FROM gov_dlp.column_profiles p
WHERE d.column_fqn = p.column_fqn
  AND p.scan_id = @scan_id
  AND d.status = 'approved'
  AND d.term_id = p.proposed_term_id
  AND EXISTS (
    SELECT 1 FROM gov_dlp.drift_events e
    WHERE e.column_fqn = d.column_fqn
      AND e.scan_id = p.scan_id
      AND e.event_type = 'CONFIRMED'
  );
