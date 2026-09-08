import { randomUUID } from "crypto";
import type {
  ApprovedDecision,
  ColumnNameRule,
  DriftEvent,
  GovStore,
  LockPolicy,
  NameRuleNegative,
  ReviewAudit,
} from "./types";

const STEWARD = process.env.STEWARD_EMAIL ?? "steward@local";

function nowIso(): string {
  return new Date().toISOString();
}

function termResource(store: GovStore, termId: string | null): string | null {
  if (!termId) return null;
  return store.term_catalog.find((t) => t.term_id === termId)?.policy_tag_resource ?? null;
}

function audit(
  store: GovStore,
  row: Omit<ReviewAudit, "audit_id" | "actor" | "at"> & {
    actor?: string;
    at?: string;
  },
): ReviewAudit {
  const rec: ReviewAudit = {
    audit_id: `aud_${randomUUID()}`,
    actor: row.actor ?? STEWARD,
    at: row.at ?? nowIso(),
    event_id: row.event_id,
    column_fqn: row.column_fqn,
    action: row.action,
    previous_term_id: row.previous_term_id,
    new_term_id: row.new_term_id,
    notes: row.notes,
    details: row.details,
  };
  store.review_audit.unshift(rec);
  return rec;
}

function requireEvent(store: GovStore, eventId: string): DriftEvent {
  const event = store.drift_events.find((e) => e.event_id === eventId);
  if (!event) throw new Error(`Unknown event ${eventId}`);
  return event;
}

function upsertDecision(store: GovStore, row: ApprovedDecision): void {
  const idx = store.approved_decisions.findIndex((d) => d.column_fqn === row.column_fqn);
  if (idx >= 0) store.approved_decisions[idx] = row;
  else store.approved_decisions.push(row);
}

function closeEvent(
  event: DriftEvent,
  status: DriftEvent["status"],
  notes: string,
): void {
  event.status = status;
  event.reviewed_by = STEWARD;
  event.reviewed_at = nowIso();
  event.review_notes = notes;
}

function latestProfile(store: GovStore, fqn: string) {
  return store.column_profiles
    .filter((p) => p.column_fqn === fqn)
    .sort((a, b) => (a.profiled_at < b.profiled_at ? 1 : -1))[0];
}

function existingDecision(store: GovStore, fqn: string): ApprovedDecision | null {
  return store.approved_decisions.find((d) => d.column_fqn === fqn) ?? null;
}

export function approveEvent(
  store: GovStore,
  eventId: string,
  args: { notes?: string; lock_policy?: LockPolicy; term_id?: string },
): { event: DriftEvent; decision: ApprovedDecision } {
  const event = requireEvent(store, eventId);
  const termId = args.term_id ?? event.proposed_term_id;
  if (!termId) throw new Error("No term to approve. Use untag or override.");
  const profile = latestProfile(store, event.column_fqn);
  const prev = existingDecision(store, event.column_fqn);
  const decision: ApprovedDecision = {
    column_fqn: event.column_fqn,
    term_id: termId,
    policy_tag_resource: termResource(store, termId),
    status: "approved",
    rejected_term_id: null,
    lock_policy: args.lock_policy ?? "lock",
    approved_by: STEWARD,
    approved_at: nowIso(),
    taxonomy_version: "v1",
    last_confirmed_scan_id: profile?.scan_id ?? event.scan_id,
    last_dlp_fingerprint: profile?.dlp_fingerprint ?? event.new_dlp_fingerprint,
    last_value_fingerprint: profile?.value_fingerprint ?? event.new_value_fingerprint,
    last_dlp_payload: profile?.dlp_payload ?? null,
    last_value_payload: profile?.value_payload ?? null,
    notes: args.notes ?? "",
    do_not_ask_until: null,
  };
  upsertDecision(store, decision);
  closeEvent(event, "approved", args.notes ?? "Approved proposed term.");
  audit(store, {
    event_id: event.event_id,
    column_fqn: event.column_fqn,
    action: args.term_id && args.term_id !== event.proposed_term_id ? "override" : "approve",
    previous_term_id: prev?.term_id ?? event.previous_term_id,
    new_term_id: termId,
    notes: args.notes ?? "",
    details: { lock_policy: decision.lock_policy, policy_tag_resource: decision.policy_tag_resource },
  });
  return { event, decision };
}

export function rejectEvent(
  store: GovStore,
  eventId: string,
  args: { notes?: string; never_suggest?: boolean },
): { event: DriftEvent; decision: ApprovedDecision; negative?: NameRuleNegative } {
  const event = requireEvent(store, eventId);
  const profile = latestProfile(store, event.column_fqn);
  const prev = existingDecision(store, event.column_fqn);
  const rejectedTerm = event.proposed_term_id;
  const until = new Date();
  until.setDate(until.getDate() + 7);
  const decision: ApprovedDecision = {
    column_fqn: event.column_fqn,
    term_id: prev?.term_id ?? null,
    policy_tag_resource: prev?.policy_tag_resource ?? null,
    status: "rejected",
    rejected_term_id: rejectedTerm,
    lock_policy: prev?.lock_policy ?? "lock",
    approved_by: STEWARD,
    approved_at: nowIso(),
    taxonomy_version: prev?.taxonomy_version ?? "v1",
    last_confirmed_scan_id: profile?.scan_id ?? event.scan_id,
    last_dlp_fingerprint: profile?.dlp_fingerprint ?? event.new_dlp_fingerprint,
    last_value_fingerprint: profile?.value_fingerprint ?? event.new_value_fingerprint,
    last_dlp_payload: profile?.dlp_payload ?? prev?.last_dlp_payload ?? null,
    last_value_payload: profile?.value_payload ?? prev?.last_value_payload ?? null,
    notes: args.notes ?? "",
    do_not_ask_until: until.toISOString(),
  };
  upsertDecision(store, decision);
  closeEvent(event, "rejected", args.notes ?? "Rejected proposed term.");

  let negative: NameRuleNegative | undefined;
  if (args.never_suggest && rejectedTerm && profile) {
    negative = {
      negative_id: `neg_${randomUUID().slice(0, 8)}`,
      pattern: profile.name_normalized,
      scope_type: "dataset",
      scope_value: `${profile.project_id}.${profile.dataset_id}`,
      rejected_term_id: rejectedTerm,
      column_fqn: profile.column_fqn,
      notes: args.notes ?? "Steward: never suggest this name→term in this dataset.",
      created_at: nowIso(),
    };
    store.column_name_rule_negatives.push(negative);
  }

  audit(store, {
    event_id: event.event_id,
    column_fqn: event.column_fqn,
    action: "reject",
    previous_term_id: event.proposed_term_id,
    new_term_id: prev?.term_id ?? null,
    notes: args.notes ?? "",
    details: {
      never_suggest: Boolean(args.never_suggest),
      do_not_ask_until: decision.do_not_ask_until,
      negative_id: negative?.negative_id ?? null,
    },
  });
  return { event, decision, negative };
}

export function untagEvent(
  store: GovStore,
  eventId: string,
  args: { notes: string },
): { event: DriftEvent; decision: ApprovedDecision } {
  const event = requireEvent(store, eventId);
  const profile = latestProfile(store, event.column_fqn);
  const prev = existingDecision(store, event.column_fqn);
  const decision: ApprovedDecision = {
    column_fqn: event.column_fqn,
    term_id: null,
    policy_tag_resource: null,
    status: "untag_approved",
    rejected_term_id: prev?.term_id ?? event.previous_term_id,
    lock_policy: "allow_untag",
    approved_by: STEWARD,
    approved_at: nowIso(),
    taxonomy_version: prev?.taxonomy_version ?? "v1",
    last_confirmed_scan_id: profile?.scan_id ?? event.scan_id,
    last_dlp_fingerprint: profile?.dlp_fingerprint ?? event.new_dlp_fingerprint,
    last_value_fingerprint: profile?.value_fingerprint ?? event.new_value_fingerprint,
    last_dlp_payload: profile?.dlp_payload ?? null,
    last_value_payload: profile?.value_payload ?? null,
    notes: args.notes,
    do_not_ask_until: null,
  };
  upsertDecision(store, decision);
  closeEvent(event, "approved", args.notes);
  audit(store, {
    event_id: event.event_id,
    column_fqn: event.column_fqn,
    action: "untag",
    previous_term_id: prev?.term_id ?? event.previous_term_id,
    new_term_id: null,
    notes: args.notes,
    details: { status: "untag_approved" },
  });
  return { event, decision };
}

export function setLockPolicy(
  store: GovStore,
  eventId: string,
  lock_policy: LockPolicy,
  notes?: string,
): { event: DriftEvent; decision: ApprovedDecision } {
  const event = requireEvent(store, eventId);
  const prev = existingDecision(store, event.column_fqn);
  if (!prev) throw new Error("No approved decision to lock. Approve a term first.");
  prev.lock_policy = lock_policy;
  if (notes) prev.notes = notes;
  audit(store, {
    event_id: event.event_id,
    column_fqn: event.column_fqn,
    action: "set_lock_policy",
    previous_term_id: prev.term_id,
    new_term_id: prev.term_id,
    notes: notes ?? "",
    details: { lock_policy },
  });
  return { event, decision: prev };
}

export function promoteRule(
  store: GovStore,
  eventId: string,
  args: { scope_type?: "dataset" | "project" | "org"; notes?: string },
): { event: DriftEvent; rule: ColumnNameRule } {
  const event = requireEvent(store, eventId);
  const profile = latestProfile(store, event.column_fqn);
  if (!profile) throw new Error("No profile for column");
  const decision = existingDecision(store, event.column_fqn);
  const termId = decision?.term_id ?? event.proposed_term_id;
  if (!termId) throw new Error("Approve a term before promoting a name rule.");
  if (decision?.status !== "approved") {
    throw new Error("Promote is only allowed from an approved decision.");
  }

  const scopeType = args.scope_type ?? "dataset";
  const scopeValue =
    scopeType === "org"
      ? "*"
      : scopeType === "project"
        ? profile.project_id
        : `${profile.project_id}.${profile.dataset_id}`;

  const rule: ColumnNameRule = {
    rule_id: `rule_promoted_${profile.name_normalized}_${randomUUID().slice(0, 8)}`,
    match_type: "exact_normalized",
    pattern: profile.name_normalized,
    term_id: termId,
    scope_type: scopeType,
    scope_value: scopeValue,
    confidence: 0.85,
    source: "promoted_decision",
    allow_auto_propose: true,
    allow_auto_apply: false,
    created_from_fqn: profile.column_fqn,
    notes: args.notes ?? `Promoted from approved ${profile.column_fqn}`,
    active: true,
    created_at: nowIso(),
  };
  store.column_name_rules.push(rule);
  audit(store, {
    event_id: event.event_id,
    column_fqn: event.column_fqn,
    action: "promote_rule",
    previous_term_id: termId,
    new_term_id: termId,
    notes: args.notes ?? "",
    details: {
      rule_id: rule.rule_id,
      scope_type: rule.scope_type,
      scope_value: rule.scope_value,
      allow_auto_apply: false,
    },
  });
  return { event, rule };
}

export function stubApplyTag(args: {
  column_fqn: string;
  policy_tag_resource: string;
}): { ok: true; stub: true; message: string; logged: Record<string, string> } {
  const logged = {
    column_fqn: args.column_fqn,
    policy_tag_resource: args.policy_tag_resource,
    at: nowIso(),
  };
  console.info("[TODO apply-tag] would call tables.update", logged);
  return {
    ok: true,
    stub: true,
    message:
      "TODO: apply-tag is stubbed. Policy tags are applied only from an approved decision, never from DLP or a name rule. This slice does not call tables.update.",
    logged,
  };
}
