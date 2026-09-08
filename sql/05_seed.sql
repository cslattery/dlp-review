-- Dimension + incoming fixtures for gov_dlp.
-- Full finding rows and generated profiles/events used by the review app
-- live in /seed/*.json (produced by `npx tsx scripts/build-seed.ts`).
-- After loading this file, run 01b_normalize → 01_column_profiles →
-- 01c_propose → 02_drift_events to materialise the queue in BigQuery.

DELETE FROM gov_dlp.term_catalog WHERE TRUE;
INSERT INTO gov_dlp.term_catalog (
  term_id, display_name, description, when_to_use, when_not_to_use,
  policy_tag_resource, sensitivity_rank, parent_term_id, term_family,
  dlp_info_types, masking_policy, auto_propose_ok, active, expected_types,
  min_length, max_length, min_ndv, max_ndv, max_null_rate
) VALUES
('pii.customer.email', 'Customer email', 'A mailbox that can reach a person.',
 'Columns whose values are primarily email addresses.',
 'Free-text notes that occasionally mention an email.',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_email',
 50, NULL, 'pii', ['EMAIL_ADDRESS'], 'HASH', TRUE, TRUE, ['STRING'], 6, 254, 50, NULL, 0.4),
('pii.customer.phone', 'Customer phone', 'A personal or billing phone number.',
 'Direct-dial numbers stored as a dedicated column.',
 'Mixed contact blobs or extension-only fields.',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_phone',
 45, NULL, 'pii', ['PHONE_NUMBER'], 'HASH', TRUE, TRUE, ['STRING', 'INT64'], 7, 20, 20, NULL, 0.5),
('pii.customer.name', 'Customer name', 'A person\'s given or family name.',
 'Name columns for people.', 'Product, venue, or legal-entity names.',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_name',
 40, NULL, 'pii', ['PERSON_NAME'], 'DEFAULT', TRUE, TRUE, ['STRING'], 2, 80, 10, NULL, 0.3),
('pii.customer.dob', 'Date of birth', 'A person\'s date of birth.',
 'Dedicated DOB columns.', 'Event dates, created_at, or order dates.',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_dob',
 60, NULL, 'pii', ['DATE_OF_BIRTH'], 'ALWAYS_NULL', TRUE, TRUE, ['DATE', 'TIMESTAMP', 'STRING'], NULL, NULL, 20, NULL, 0.4),
('pii.customer.national_id', 'National id / payment PAN',
 'Government id or primary account number.',
 'NI numbers, national ids, or card PANs.',
 'Internal surrogate keys and site codes.',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_national_id',
 80, NULL, 'pii', ['CREDIT_CARD_NUMBER', 'UK_NATIONAL_INSURANCE_NUMBER'],
 'ALWAYS_NULL', TRUE, TRUE, ['STRING'], 8, 19, 20, NULL, 0.3),
('pii.customer.address', 'Customer address', 'A street or postal address.',
 'Structured or free-text address columns.', 'City-only or country-code columns.',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_address',
 35, NULL, 'pii', ['STREET_ADDRESS'], 'DEFAULT', TRUE, TRUE, ['STRING'], 8, 200, 20, NULL, 0.5),
('pii.free_text', 'Free text (may contain PII)', 'Unstructured notes that can leak PII.',
 'Comments, tickets, and support notes.', 'Dedicated identifier or PII columns.',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/free_text',
 20, NULL, 'pii', [], 'DEFAULT', FALSE, TRUE, ['STRING'], NULL, NULL, NULL, NULL, NULL),
('pii.mixed', 'Mixed PII', 'A column that holds more than one PII class.',
 'Contact blobs with email and phone together.', 'A column with one dominant infoType.',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/mixed_pii',
 70, NULL, 'pii', [], 'ALWAYS_NULL', FALSE, TRUE, ['STRING'], NULL, NULL, NULL, NULL, NULL),
('identifier.network.site', 'Radio / network site id',
 'A 5–7 digit site key. DLP will not detect these safely.',
 'site_id, siteid, site_code, or customer.site.id.',
 'job_id, UUID tokens, or payment identifiers.',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/network_site',
 15, NULL, 'identifier', [], 'NONE', TRUE, TRUE, ['INT64', 'STRING', 'NUMERIC'], 4, 8, 10, 100000, 0.3),
('identifier.network.exchange', 'Exchange / PoP id',
 'An exchange or point-of-presence code.',
 'exchange_id and pop_id columns.', 'Generic location text.',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/network_exchange',
 15, NULL, 'identifier', [], 'NONE', TRUE, TRUE, ['STRING', 'INT64'], 3, 12, 5, 50000, 0.3),
('identifier.account.number', 'Account number',
 'An internal account or billing identifier.',
 'Account numbers that are not national ids.', 'Card PANs or government ids.',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/account_number',
 25, NULL, 'identifier', [], 'HASH', TRUE, TRUE, ['STRING', 'INT64'], 6, 20, 50, NULL, 0.2),
('other.unclassified', 'Unclassified', 'No business term assigned yet.',
 'Explicit steward decision that a column is not in the catalog.',
 'As an auto-proposal.',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/unclassified',
 0, NULL, 'other', [], 'NONE', FALSE, TRUE, [], NULL, NULL, NULL, NULL, NULL);

DELETE FROM gov_dlp.info_type_map WHERE TRUE;
INSERT INTO gov_dlp.info_type_map (info_type, term_id, priority) VALUES
('EMAIL_ADDRESS', 'pii.customer.email', 10),
('PHONE_NUMBER', 'pii.customer.phone', 10),
('PERSON_NAME', 'pii.customer.name', 10),
('DATE_OF_BIRTH', 'pii.customer.dob', 10),
('CREDIT_CARD_NUMBER', 'pii.customer.national_id', 10),
('UK_NATIONAL_INSURANCE_NUMBER', 'pii.customer.national_id', 10),
('STREET_ADDRESS', 'pii.customer.address', 10);

DELETE FROM gov_dlp.column_name_rules WHERE TRUE;
INSERT INTO gov_dlp.column_name_rules (
  rule_id, match_type, pattern, term_id, scope_type, scope_value, confidence,
  source, allow_auto_propose, allow_auto_apply, created_from_fqn, notes, active, created_at
) VALUES
('rule_site_id_ran_prod', 'exact_normalized', 'site_id', 'identifier.network.site',
 'dataset', 'myproj.ran_prod', 0.95, 'manual_seed', TRUE, FALSE,
 'myproj.ran_prod.sites.site_id', 'RAN site keys are 6-digit ints. Never a custom DLP regex.',
 TRUE, TIMESTAMP '2026-01-12 10:00:00'),
('rule_siteid_ran_prod', 'exact_normalized', 'siteid', 'identifier.network.site',
 'dataset', 'myproj.ran_prod', 0.93, 'manual_seed', TRUE, FALSE, NULL,
 'Collapsed camelCase form.', TRUE, TIMESTAMP '2026-01-12 10:00:00'),
('rule_site_code_ran_prod', 'exact_normalized', 'site_code', 'identifier.network.site',
 'dataset', 'myproj.ran_prod', 0.90, 'manual_seed', TRUE, FALSE, NULL, '',
 TRUE, TIMESTAMP '2026-01-12 10:00:00'),
('rule_site_id_project', 'exact_normalized', 'site_id', 'identifier.network.site',
 'project', 'myproj', 0.80, 'manual_seed', TRUE, FALSE, NULL,
 'Project-wide suggestion for site_id. Shape-checked against the catalog.',
 TRUE, TIMESTAMP '2026-01-12 10:00:00'),
('rule_path_suffix_site_id', 'path_suffix', 'site_id', 'identifier.network.site',
 'org', '*', 0.75, 'manual_seed', TRUE, FALSE, NULL,
 'Nested paths such as customer.site.id → site_id.', TRUE, TIMESTAMP '2026-02-01 10:00:00'),
('rule_regex_site', 'regex', r'(^|_)site(_?id|_code)$', 'identifier.network.site',
 'org', '*', 0.55, 'manual_seed', TRUE, FALSE, NULL,
 'Low-confidence safety net. Still suggestion-only.', TRUE, TIMESTAMP '2026-02-01 10:00:00'),
('rule_exchange_id', 'exact_normalized', 'exchange_id', 'identifier.network.exchange',
 'org', '*', 0.88, 'manual_seed', TRUE, FALSE, NULL, '', TRUE, TIMESTAMP '2026-02-01 10:00:00'),
('rule_pop_id', 'exact_normalized', 'pop_id', 'identifier.network.exchange',
 'org', '*', 0.88, 'manual_seed', TRUE, FALSE, NULL, '', TRUE, TIMESTAMP '2026-02-01 10:00:00');

DELETE FROM gov_dlp.column_name_rule_negatives WHERE TRUE;
INSERT INTO gov_dlp.column_name_rule_negatives (
  negative_id, pattern, scope_type, scope_value, rejected_term_id, column_fqn, notes, created_at
) VALUES
('neg_job_id_site', 'job_id', 'dataset', 'myproj.ops', 'identifier.network.site',
 'myproj.ops.jobs.job_id', 'job_id is an ops key, never a radio site.',
 TIMESTAMP '2026-03-04 12:00:00');

DELETE FROM gov_dlp.column_metadata WHERE TRUE;
INSERT INTO gov_dlp.column_metadata (
  project_id, dataset_id, table_id, column_name, field_path, data_type, description,
  is_nullable, existing_policy_tag, approx_ndv, null_rate, length_p50, row_count
) VALUES
('myproj', 'customers', 'customers', 'email', 'email', 'STRING', 'Primary login email.',
 TRUE, NULL, 98000, 0.02, 22, 1000),
('myproj', 'customers', 'customers', 'notes', 'notes', 'STRING', 'Free-text support notes.',
 TRUE, NULL, 82000, 0.11, 180, 1000),
('myproj', 'products', 'products', 'product_name', 'product_name', 'STRING', 'Catalogue product title.',
 TRUE, NULL, 12000, 0.00, 28, 80),
('myproj', 'customers', 'customers', 'contact', 'contact', 'STRING', 'Legacy contact blob.',
 TRUE, NULL, 9400, 0.04, 40, 100),
('myproj', 'customers', 'customers', 'email_stable', 'email_stable', 'STRING', 'Billing email, already tagged.',
 TRUE, 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_email',
 99000, 0.01, 21, 1000),
('myproj', 'customers', 'customers', 'legacy_id', 'legacy_id', 'STRING',
 'Was billed as email; rescan looks like national id.',
 TRUE, 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_email',
 81000, 0.03, 9, 1000),
('myproj', 'kyc', 'subjects', 'national_id', 'national_id', 'STRING', 'Subject national identifier.',
 TRUE, 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_national_id',
 74000, 0.05, 18, 1000),
('myproj', 'customers', 'customers', 'retired_email', 'retired_email', 'STRING',
 'Column quietly emptied after a purge.',
 TRUE, 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_email',
 12, 0.91, 0, 1000),
('myproj', 'customers', 'customers', 'notes_free', 'notes_free', 'STRING',
 'Notes previously rejected as email.', TRUE, NULL, 76000, 0.08, 140, 1000),
('myproj', 'customers', 'customers', 'mobile', 'mobile', 'STRING',
 'Mobile number. Live tag disagrees with last approval.',
 TRUE, 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_email',
 88000, 0.04, 12, 800),
('myproj', 'raw', 'events', 'widget_token', 'widget_token', 'STRING',
 'Custom widget token, no catalog map.', TRUE, NULL, 50000, 0.00, 24, 500),
('myproj', 'customers', 'customer', 'id', 'site.id', 'INT64',
 'Nested site key on the customer record.', TRUE, NULL, 6100, 0.01, 6, 20000),
('myproj', 'ran_prod', 'sites', 'site_id', 'site_id', 'INT64',
 '6-digit RAN site identifier.', TRUE, NULL, 4200, 0.00, 6, 4200),
('myproj', 'ops', 'jobs', 'job_id', 'job_id', 'STRING',
 'Airflow / batch job id.', TRUE, NULL, 180000, 0.00, 16, 180000),
('myproj', 'staging', 'sites', 'site_id', 'site_id', 'STRING',
 'Staging copy using 32-char hex tokens.', TRUE, NULL, 900, 0.02, 32, 900),
('myproj', 'finance', 'cards', 'site_id', 'site_id', 'STRING',
 'Misnamed column that holds card PANs.', TRUE, NULL, 64000, 0.01, 16, 800);

DELETE FROM gov_dlp.approved_decisions WHERE TRUE;
INSERT INTO gov_dlp.approved_decisions (
  column_fqn, term_id, policy_tag_resource, status, rejected_term_id, lock_policy,
  approved_by, approved_at, taxonomy_version, last_confirmed_scan_id, notes, do_not_ask_until
) VALUES
('myproj.customers.customers.email_stable', 'pii.customer.email',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_email',
 'approved', NULL, 'lock', 'ada@myproj', TIMESTAMP '2026-07-02 11:00:00', 'v1',
 'scan_20260801', 'Confirmed billing email.', NULL),
('myproj.customers.customers.legacy_id', 'pii.customer.email',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_email',
 'approved', NULL, 'lock', 'ada@myproj', TIMESTAMP '2026-06-10 11:00:00', 'v1',
 'scan_20260801', 'Originally classified as email.', NULL),
('myproj.kyc.subjects.national_id', 'pii.customer.national_id',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_national_id',
 'approved', NULL, 'lock', 'ada@myproj', TIMESTAMP '2026-05-20 11:00:00', 'v1',
 'scan_20260801', 'KYC national id.', NULL),
('myproj.customers.customers.retired_email', 'pii.customer.email',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_email',
 'approved', NULL, 'lock', 'ada@myproj', TIMESTAMP '2026-04-01 11:00:00', 'v1',
 'scan_20260801', 'Was a live email column.', NULL),
('myproj.customers.customers.notes_free', NULL, NULL, 'rejected', 'pii.customer.email',
 'lock', 'ada@myproj', TIMESTAMP '2026-08-02 11:00:00', 'v1', 'scan_20260801',
 'Occasional emails in notes are not a column class.', TIMESTAMP '2026-09-15 00:00:00'),
('myproj.customers.customers.mobile', 'pii.customer.phone',
 'projects/myproj/locations/us/taxonomies/dlp_governance/policyTags/customer_phone',
 'approved', NULL, 'lock', 'ada@myproj', TIMESTAMP '2026-03-18 11:00:00', 'v1',
 'scan_20260801', 'Approved as phone. Someone attached the email tag in BigQuery.', NULL);

-- Sample findings (quotes only). Expand from /seed/dlp_findings.json for a full scan.
DELETE FROM gov_dlp.dlp_findings WHERE TRUE;
INSERT INTO gov_dlp.dlp_findings (
  job_id, create_time, project_id, dataset_id, table_id, field_name,
  info_type, likelihood, quote, quote_hash, rows_inspected
) VALUES
('scan_20260908', TIMESTAMP '2026-09-08 08:40:00', 'myproj', 'customers', 'customers', 'email',
 'EMAIL_ADDRESS', 'VERY_LIKELY', 'a***@retail.example',
 '6f3c0c6c6f3c0c6c6f3c0c6c6f3c0c6c6f3c0c6c6f3c0c6c6f3c0c6c6f3c0c6c', 1000);

-- Prefer loading the generated JSON for a complete histogram:
--   bq load --source_format=NEWLINE_DELIMITED_JSON --replace \\
--     $BQ_PROJECT:gov_dlp.dlp_findings seed/dlp_findings.ndjson
-- Then run 01_column_profiles.sql, 01c_propose.sql, 02_drift_events.sql.
-- The Next.js app does not need BigQuery: it reads /seed/*.json offline.
