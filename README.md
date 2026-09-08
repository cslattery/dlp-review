# DLP column classification review

Local-first slice of a data-governance app for **BigQuery + Cloud DLP** (Sensitive Data Protection).

Cloud DLP inspect jobs scan BigQuery tables. Findings are cell-level. Policy tags are column-level. This repo rolls findings into a per-column **profile**, proposes a **business term**, emits **drift events** against the last steward decision, and gives a steward a queue to confirm, override, reject, untag, or promote a name rule.

Applying a BigQuery policy tag happens **only** from an approved decision. Never from DLP, never from a name rule, never from an LLM. The apply-tag API is stubbed and does not call `tables.update`.

## The model

```
DLP findings + column_metadata
        ↓  /sql/01_column_profiles.sql
column_profiles   (DLP histogram fingerprint + value-sketch fingerprint)
        ↓  /sql/01c_propose.sql
proposed_term_id  (approved FQN is the drift baseline, not copied onto the proposal)
        ↓  /sql/02_drift_events.sql
drift_events      (open tickets; CONFIRMED / REJECTED_REPEAT stay out of the default queue)
        ↓  steward in this app
approved_decisions + review_audit
        ↓  later job (out of scope)
tagger calls tables.update from the approved policy_tag_resource only
```

Rules this slice enforces:

- One column → at most one business term / policy tag.
- A rescan is a drift check, not a retag. Previously approved tags are the source of truth.
- Never silently overwrite a steward decision. Never auto-downgrade or auto-untag.
- Sensitivity upgrades may be auto-**proposed**; they still require review here.
- If a steward rejected a term and the fingerprint has not changed materially, do not reopen (`REJECTED_REPEAT`, suppressed).
- If the live BigQuery policy tag ≠ last approved tag, emit `SCHEMA_DRIFT`.
- Site ids, exchange codes, and 6-digit location keys are **not** custom DLP regex infoTypes. They use column-name rules plus optional shape checks.
- Name rules **suggest**. `allow_auto_apply` defaults to `FALSE` and is never set true by promote.
- Quotes in profiles are short DLP snippets already in findings. Top values are SHA-256 hashes only.

Proposal precedence (fresh each scan):

1. Name rule (scope + match order, minus negatives), then shape check against `term_catalog`.
2. Else DLP: mixed / low hit rate / mapped dominant infoType / unmapped.
3. **Conflict** when an identifier name rule fights a high-share PII DLP term — queue shows both; proposed term is the DLP term (safer default).

## Run locally (seed JSON, no BigQuery)

```bash
npm install
npm run dev
```

Opens on [http://127.0.0.1:43180](http://127.0.0.1:43180). The API reads `/seed/*.json`. Steward actions write to `/.data` (created from seed on first mutation). Delete `/.data` to reset the queue.

```bash
npm run generate-seed   # rebuild profiles + drift from fixtures
```

### Pages

| Route | What it is |
| --- | --- |
| `/` | Steward queue (open events; hides `CONFIRMED` and `REJECTED_REPEAT`) |
| `/columns/:fqn` | Histogram + value-sketch diff, proposal, review actions |
| `/terms` | Read-only term catalog + name rules |
| `/audit` | Append-only steward actions |

Keyboard on the queue and detail pages: `j` / `k` next, `a` approve, `r` reject.

### API

- `GET /api/queue`
- `GET /api/columns/:fqn`
- `GET /api/terms`
- `GET /api/audit`
- `POST /api/events/:id/approve|override|reject|untag|promote-rule|lock`
- `POST /api/apply-tag` — **stub that logs only** (`TODO`)

If `BQ_PROJECT` is set and `BQ_DATASET=gov_dlp`, that is the intended BigQuery target for the SQL in `/sql`. This slice still serves the review UI from seed unless you wire a client; the SQL is the contract.

## Load fixtures into BigQuery

```bash
bq mk --dataset $BQ_PROJECT:gov_dlp
# create tables
bq query --use_legacy_sql=false < sql/00_schema.sql
bq query --use_legacy_sql=false < sql/01b_normalize.sql
bq query --use_legacy_sql=false < sql/05_seed.sql
# optional: load the full finding histogram
# bq load --source_format=NEWLINE_DELIMITED_JSON ...
bq query --use_legacy_sql=false < sql/01_column_profiles.sql
bq query --use_legacy_sql=false < sql/01c_propose.sql
bq query --use_legacy_sql=false < sql/02_drift_events.sql
```

Review statements live in `sql/03_apply_review.sql` and `sql/04_promote_rule.sql`.

## Seed columns

Project `myproj`. The generated queue includes `NAME_RULE_NEW`, `SHAPE_MISMATCH`, `CONFLICT`, `SCHEMA_DRIFT`, `TERM_UPGRADE`, `TERM_DOWNGRADE`, `UNTAG_CANDIDATE`, plus hidden `REJECTED_REPEAT` and `CONFIRMED`.

| Column | What you should see |
| --- | --- |
| `customers.customers.email` | `NEW_UNTAGGED` / `dlp_map` |
| `customers.customers.notes` | Low hit rate — **not** queued as email |
| `products.products.product_name` | `NEW_UNTAGGED` person-name vs product |
| `customers.customers.contact` | `MIXED` |
| `customers.customers.email_stable` | `CONFIRMED` (hidden by default) |
| `customers.customers.legacy_id` | `TERM_UPGRADE` email → national id |
| `kyc.subjects.national_id` | `TERM_DOWNGRADE` |
| `customers.customers.retired_email` | `UNTAG_CANDIDATE` |
| `customers.customers.notes_free` | `REJECTED_REPEAT` (hidden) |
| `customers.customers.mobile` | `SCHEMA_DRIFT` |
| `raw.events.widget_token` | Unmapped custom infoType — no ticket |
| `customers.customer.site.id` | `NAME_RULE_NEW` (path suffix) |
| `ran_prod.sites.site_id` | `NAME_RULE_NEW` (6-digit ints) |
| `ops.jobs.job_id` | Must **not** suggest site |
| `staging.sites.site_id` | `SHAPE_MISMATCH` (32-char tokens) |
| `finance.cards.site_id` | `CONFLICT` (name=site, DLP=PAN) |

## Out of scope

Running DLP jobs, Vertex/Gemini, IAM/IAP/Terraform, actually patching table schemas, taxonomy replication, embeddings, and custom DLP regex infoTypes for site ids.
