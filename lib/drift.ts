import {
  hitRateMaterial,
  valueSketchMaterial,
} from "./fingerprint";
import type {
  ApprovedDecision,
  ColumnProfile,
  DriftEvent,
  EventType,
  Term,
} from "./types";

export function isMaterialChange(args: {
  profile: ColumnProfile;
  decision: ApprovedDecision | null;
  previousProfile?: ColumnProfile | null;
  previousTerm: Term | undefined;
  proposedTerm: Term | undefined;
}): boolean {
  const { profile, decision, previousProfile, previousTerm, proposedTerm } = args;
  const hasBaseline = Boolean(
    previousProfile ||
      (decision &&
        (decision.last_dlp_fingerprint != null ||
          decision.last_value_fingerprint != null)),
  );
  if (!hasBaseline) {
    return Boolean(
      proposedTerm &&
        previousTerm &&
        proposedTerm.sensitivity_rank > previousTerm.sensitivity_rank,
    );
  }
  const prevDlp = previousProfile?.dominant_info_type ?? null;
  const prevHit = previousProfile?.hit_rate ?? null;
  const prevMixed = previousProfile?.is_mixed ?? false;
  const prevDlpFp = decision?.last_dlp_fingerprint ?? previousProfile?.dlp_fingerprint;
  const prevValFp =
    decision?.last_value_fingerprint ?? previousProfile?.value_fingerprint;
  const prevValPayload =
    decision?.last_value_payload ?? previousProfile?.value_payload ?? null;

  if (
    prevDlp !== profile.dominant_info_type &&
    (profile.dominant_share ?? 0) >= 0.2
  ) {
    return true;
  }
  if (hitRateMaterial(prevHit, profile.hit_rate)) return true;
  if (previousProfile && prevMixed !== profile.is_mixed) return true;
  if (
    proposedTerm &&
    previousTerm &&
    proposedTerm.sensitivity_rank > previousTerm.sensitivity_rank
  ) {
    return true;
  }
  if (
    prevDlpFp != null &&
    profile.dlp_fingerprint !== prevDlpFp
  ) {
    return true;
  }
  if (
    prevValFp != null &&
    profile.value_fingerprint !== prevValFp &&
    valueSketchMaterial(prevValPayload, profile.value_payload)
  ) {
    return true;
  }
  return false;
}

function classifyEvent(args: {
  profile: ColumnProfile;
  decision: ApprovedDecision | null;
  previousProfile?: ColumnProfile | null;
  previousTerm: Term | undefined;
  proposedTerm: Term | undefined;
  now: Date;
}): { event_type: EventType; status: DriftEvent["status"]; skip: boolean } {
  const { profile, decision, previousTerm, proposedTerm, now } = args;
  const material = isMaterialChange(args);
  const live = profile.existing_policy_tag;
  const approvedTag = decision?.policy_tag_resource ?? null;

  if (live && decision?.status === "approved" && approvedTag && live !== approvedTag) {
    return { event_type: "SCHEMA_DRIFT", status: "open", skip: false };
  }

  if (profile.proposal_source === "conflict") {
    return { event_type: "CONFLICT", status: "open", skip: false };
  }
  if (profile.proposal_source === "name_rule_shape_mismatch") {
    return { event_type: "SHAPE_MISMATCH", status: "open", skip: false };
  }
  if (profile.proposal_source === "mixed" && !profile.proposed_term_id) {
    return { event_type: "MIXED", status: "open", skip: false };
  }

  if (!decision) {
    if (profile.proposed_term_id && profile.proposal_source === "name_rule") {
      return { event_type: "NAME_RULE_NEW", status: "open", skip: false };
    }
    if (profile.proposed_term_id && profile.proposal_source === "dlp_map") {
      return { event_type: "NEW_UNTAGGED", status: "open", skip: false };
    }
    return { event_type: "NEEDS_REVIEW", status: "open", skip: true };
  }

  if (decision.status === "rejected") {
    if (
      profile.proposed_term_id &&
      profile.proposed_term_id === decision.rejected_term_id &&
      !material
    ) {
      return { event_type: "REJECTED_REPEAT", status: "suppressed", skip: false };
    }
    if (
      profile.proposed_term_id === decision.rejected_term_id &&
      material
    ) {
      return { event_type: "NEEDS_REVIEW", status: "open", skip: false };
    }
  }

  if (decision.status === "approved") {
    const sameTerm = decision.term_id === profile.proposed_term_id;
    if (sameTerm && !material) {
      return { event_type: "CONFIRMED", status: "confirmed", skip: false };
    }
    if (sameTerm && material) {
      return { event_type: "NEEDS_REVIEW", status: "open", skip: false };
    }
    if (
      profile.proposed_term_id &&
      decision.term_id &&
      profile.proposed_term_id !== decision.term_id
    ) {
      const prevRank = previousTerm?.sensitivity_rank ?? 0;
      const nextRank = proposedTerm?.sensitivity_rank ?? 0;
      if (!material) {
        return { event_type: "TAXONOMY_ONLY", status: "open", skip: false };
      }
      if (nextRank > prevRank) {
        return { event_type: "TERM_UPGRADE", status: "open", skip: false };
      }
      return { event_type: "TERM_DOWNGRADE", status: "open", skip: false };
    }
    if (!profile.proposed_term_id && material && decision.term_id) {
      return { event_type: "UNTAG_CANDIDATE", status: "open", skip: false };
    }
  }

  if (decision.status === "untag_approved") {
    if (profile.proposed_term_id) {
      return { event_type: "NEW_UNTAGGED", status: "open", skip: false };
    }
    return { event_type: "CONFIRMED", status: "confirmed", skip: false };
  }

  void now;
  return { event_type: "NEEDS_REVIEW", status: "open", skip: true };
}

export function emitDriftEvents(args: {
  profiles: ColumnProfile[];
  decisions: ApprovedDecision[];
  terms: Term[];
  existingEvents: DriftEvent[];
  previousProfiles?: ColumnProfile[];
  now?: Date;
}): DriftEvent[] {
  const now = args.now ?? new Date();
  const termsById = new Map(args.terms.map((t) => [t.term_id, t]));
  const decisionsByFqn = new Map(args.decisions.map((d) => [d.column_fqn, d]));
  const prevByFqn = new Map(
    (args.previousProfiles ?? []).map((p) => [p.column_fqn, p]),
  );
  const openFqns = new Set(
    args.existingEvents
      .filter((e) => e.status === "open")
      .map((e) => e.column_fqn),
  );

  const latestScan = args.profiles[0]?.scan_id ?? "scan";
  const out: DriftEvent[] = [];
  let i = 0;

  for (const profile of args.profiles) {
    if (openFqns.has(profile.column_fqn)) continue;
    const decision = decisionsByFqn.get(profile.column_fqn) ?? null;
    const previousProfile = prevByFqn.get(profile.column_fqn) ?? null;
    const previousTerm = decision?.term_id
      ? termsById.get(decision.term_id)
      : undefined;
    const proposedTerm = profile.proposed_term_id
      ? termsById.get(profile.proposed_term_id)
      : undefined;

    const classified = classifyEvent({
      profile,
      decision,
      previousProfile,
      previousTerm,
      proposedTerm,
      now,
    });
    if (classified.skip) continue;

    const material = isMaterialChange({
      profile,
      decision,
      previousProfile,
      previousTerm,
      proposedTerm,
    });

    if (decision?.do_not_ask_until) {
      const until = new Date(decision.do_not_ask_until);
      const upgrade =
        classified.event_type === "TERM_UPGRADE" && material;
      if (until > now && !upgrade && classified.status === "open") {
        classified.status = "suppressed";
      }
    }

    i += 1;
    out.push({
      event_id: `evt_${latestScan}_${String(i).padStart(2, "0")}_${profile.column_fqn.replace(/[^a-zA-Z0-9]+/g, "_")}`,
      scan_id: profile.scan_id,
      column_fqn: profile.column_fqn,
      event_type: classified.event_type,
      previous_term_id: decision?.term_id ?? null,
      proposed_term_id: profile.proposed_term_id,
      previous_sensitivity_rank: previousTerm?.sensitivity_rank ?? null,
      proposed_sensitivity_rank: proposedTerm?.sensitivity_rank ?? null,
      previous_dlp_fingerprint:
        decision?.last_dlp_fingerprint ?? previousProfile?.dlp_fingerprint ?? null,
      new_dlp_fingerprint: profile.dlp_fingerprint,
      previous_value_fingerprint:
        decision?.last_value_fingerprint ??
        previousProfile?.value_fingerprint ??
        null,
      new_value_fingerprint: profile.value_fingerprint,
      material_change: material,
      live_policy_tag: profile.existing_policy_tag,
      approved_policy_tag: decision?.policy_tag_resource ?? null,
      proposal_source: profile.proposal_source,
      status: classified.status,
      created_at: now.toISOString(),
      reviewed_by: classified.status === "confirmed" ? "system" : null,
      reviewed_at: classified.status === "confirmed" ? now.toISOString() : null,
      review_notes:
        classified.status === "confirmed"
          ? "Same approved term; fingerprints not materially changed."
          : null,
    });
  }
  return out;
}
