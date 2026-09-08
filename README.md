# DLP column classification review

Local-first slice of a data-governance app for **BigQuery + Cloud DLP** (Sensitive Data Protection).

Cloud DLP inspect jobs scan BigQuery tables. Findings are cell-level. Policy tags are column-level. This repo rolls findings into a per-column **profile**, proposes a **business term**, emits **drift events** against the last steward decision, and gives a steward a queue to confirm, override, reject, untag, or promote a name rule.

Applying a BigQuery policy tag happens **only** from an approved decision. Never from DLP, never from a name rule, never from an LLM. The apply-tag API is stubbed and does not call `tables.update`.
