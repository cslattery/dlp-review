-- Promote an approved FQN to an exact_normalized name rule.
-- Default scope is the current dataset. Wider scope requires an explicit
-- @scope_type ('dataset' | 'project' | 'org').
-- Never sets allow_auto_apply TRUE. Name rules SUGGEST only.

BEGIN
  DECLARE v_fqn STRING;
  DECLARE v_term STRING;
  DECLARE v_name STRING;
  DECLARE v_project STRING;
  DECLARE v_dataset STRING;
  DECLARE v_scope STRING;
  DECLARE v_scope_val STRING;
  DECLARE v_rule STRING;

  SET v_scope = COALESCE(@scope_type, 'dataset');

  SET (v_fqn, v_term) = (
    SELECT AS STRUCT e.column_fqn, COALESCE(d.term_id, e.proposed_term_id)
    FROM gov_dlp.drift_events e
    LEFT JOIN gov_dlp.approved_decisions d ON d.column_fqn = e.column_fqn
    WHERE e.event_id = @event_id
  );

  IF v_term IS NULL THEN
    SELECT ERROR('Approve a term before promoting a name rule.');
  END IF;

  IF (
    SELECT status FROM gov_dlp.approved_decisions WHERE column_fqn = v_fqn
  ) != 'approved' THEN
    SELECT ERROR('Promote is only allowed from an approved decision.');
  END IF;

  SET (v_name, v_project, v_dataset) = (
    SELECT AS STRUCT name_normalized, project_id, dataset_id
    FROM gov_dlp.column_profiles
    WHERE column_fqn = v_fqn
    QUALIFY ROW_NUMBER() OVER (ORDER BY profiled_at DESC) = 1
  );

  SET v_scope_val = CASE v_scope
    WHEN 'org' THEN '*'
    WHEN 'project' THEN v_project
    ELSE CONCAT(v_project, '.', v_dataset)
  END;

  SET v_rule = CONCAT('rule_promoted_', v_name, '_', GENERATE_UUID());

  INSERT INTO gov_dlp.column_name_rules (
    rule_id, match_type, pattern, term_id, scope_type, scope_value,
    confidence, source, allow_auto_propose, allow_auto_apply,
    created_from_fqn, notes, active, created_at
  )
  VALUES (
    v_rule, 'exact_normalized', v_name, v_term, v_scope, v_scope_val,
    0.85, 'promoted_decision', TRUE, FALSE,
    v_fqn, COALESCE(@notes, CONCAT('Promoted from approved ', v_fqn)),
    TRUE, CURRENT_TIMESTAMP()
  );

  INSERT INTO gov_dlp.review_audit (
    audit_id, event_id, column_fqn, action, actor, at,
    previous_term_id, new_term_id, notes, details
  )
  VALUES (
    GENERATE_UUID(), @event_id, v_fqn, 'promote_rule', @actor,
    CURRENT_TIMESTAMP(), v_term, v_term, @notes,
    TO_JSON(STRUCT(v_rule AS rule_id, v_scope AS scope_type, v_scope_val AS scope_value, FALSE AS allow_auto_apply))
  );
END;
