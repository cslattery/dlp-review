import type {
  ApprovedDecision,
  ColumnNameRule,
  ColumnProfile,
  InfoTypeMap,
  NameRuleNegative,
  ScopeType,
  Term,
} from "./types";

const SCOPE_NARROW: Record<ScopeType, number> = {
  table_prefix: 0,
  dataset: 1,
  project: 2,
  org: 3,
};

function scopeMatches(
  rule: ColumnNameRule,
  profile: ColumnProfile,
): boolean {
  switch (rule.scope_type) {
    case "org":
      return true;
    case "project":
      return rule.scope_value === profile.project_id;
    case "dataset":
      return (
        rule.scope_value === `${profile.project_id}.${profile.dataset_id}`
      );
    case "table_prefix": {
      const prefix = rule.scope_value.includes(".")
        ? rule.scope_value.split(".").pop() ?? rule.scope_value
        : rule.scope_value;
      return profile.table_id.startsWith(prefix);
    }
    default:
      return false;
  }
}

function negativeMatches(
  neg: NameRuleNegative,
  profile: ColumnProfile,
  termId: string,
): boolean {
  if (neg.rejected_term_id !== termId) return false;
  if (neg.pattern !== profile.name_normalized) return false;
  switch (neg.scope_type) {
    case "org":
      return true;
    case "project":
      return neg.scope_value === profile.project_id;
    case "dataset":
      return neg.scope_value === `${profile.project_id}.${profile.dataset_id}`;
    case "table_prefix": {
      const prefix = neg.scope_value.includes(".")
        ? neg.scope_value.split(".").pop() ?? neg.scope_value
        : neg.scope_value;
      return profile.table_id.startsWith(prefix);
    }
    default:
      return false;
  }
}

function ruleHits(rule: ColumnNameRule, profile: ColumnProfile): boolean {
  if (!rule.active || !rule.allow_auto_propose) return false;
  if (!scopeMatches(rule, profile)) return false;
  switch (rule.match_type) {
    case "exact_normalized":
      return (
        profile.name_normalized === rule.pattern ||
        profile.name_suffix === rule.pattern
      );
    case "path_suffix":
      return profile.name_suffix === rule.pattern;
    case "regex":
      try {
        return new RegExp(rule.pattern).test(profile.name_normalized);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function matchRank(rule: ColumnNameRule): number {
  const exactish = rule.match_type === "exact_normalized";
  const datasetOrTable =
    rule.scope_type === "dataset" || rule.scope_type === "table_prefix";
  if (exactish && datasetOrTable) return 0;
  if (exactish && rule.scope_type === "project") return 1;
  if (exactish && rule.scope_type === "org") return 2;
  if (rule.match_type === "path_suffix") return 3;
  if (rule.match_type === "regex") return 4;
  return 9;
}

export function matchNameRule(
  profile: ColumnProfile,
  rules: ColumnNameRule[],
  negatives: NameRuleNegative[],
): ColumnNameRule | null {
  const hits = rules
    .filter((r) => ruleHits(r, profile))
    .filter(
      (r) =>
        !negatives.some((n) => negativeMatches(n, profile, r.term_id)),
    )
    .sort((a, b) => {
      const ra = matchRank(a);
      const rb = matchRank(b);
      if (ra !== rb) return ra - rb;
      const sa = SCOPE_NARROW[a.scope_type];
      const sb = SCOPE_NARROW[b.scope_type];
      if (sa !== sb) return sa - sb;
      return b.confidence - a.confidence;
    });
  return hits[0] ?? null;
}

export function mapDlpTerm(
  infoType: string | null,
  map: InfoTypeMap[],
): InfoTypeMap | null {
  if (!infoType) return null;
  const rows = map
    .filter((m) => m.info_type === infoType)
    .sort((a, b) => a.priority - b.priority);
  return rows[0] ?? null;
}

export function shapeCheck(
  profile: ColumnProfile,
  term: Term | undefined,
): boolean | null {
  if (!term) return null;
  const sketchMissing =
    profile.approx_ndv == null &&
    profile.null_rate == null &&
    profile.length_p50 == null &&
    !profile.data_type;
  if (sketchMissing) return null;

  if (
    term.expected_types?.length &&
    profile.data_type &&
    !term.expected_types.includes(profile.data_type)
  ) {
    return false;
  }
  if (
    term.min_length != null &&
    profile.length_p50 != null &&
    profile.length_p50 < term.min_length
  ) {
    return false;
  }
  if (
    term.max_length != null &&
    profile.length_p50 != null &&
    profile.length_p50 > term.max_length
  ) {
    return false;
  }
  if (
    term.min_ndv != null &&
    profile.approx_ndv != null &&
    profile.approx_ndv < term.min_ndv
  ) {
    return false;
  }
  if (
    term.max_ndv != null &&
    profile.approx_ndv != null &&
    profile.approx_ndv > term.max_ndv
  ) {
    return false;
  }
  if (
    term.max_null_rate != null &&
    profile.null_rate != null &&
    profile.null_rate > term.max_null_rate
  ) {
    return false;
  }
  return true;
}

export function proposeForProfile(
  profile: ColumnProfile,
  args: {
    terms: Term[];
    infoTypeMap: InfoTypeMap[];
    rules: ColumnNameRule[];
    negatives: NameRuleNegative[];
    decisions: ApprovedDecision[];
  },
): ColumnProfile {
  const termsById = new Map(args.terms.map((t) => [t.term_id, t]));
  const rule = matchNameRule(profile, args.rules, args.negatives);
  const nameTerm = rule ? rule.term_id : null;
  const dlpMapped = mapDlpTerm(profile.dominant_info_type, args.infoTypeMap);
  const dlpTerm = dlpMapped?.term_id ?? null;

  const next: ColumnProfile = {
    ...profile,
    name_rule_term_id: nameTerm,
    dlp_term_id: null,
    proposed_term_id: null,
    proposal_source: null,
    proposal_rule_id: null,
    proposal_reason: "",
    shape_ok: null,
  };

  // Fresh proposal follows 2–5 even when an approval exists.
  // (Approval is the drift baseline, not the proposed term.)

  if (nameTerm) {
    const term = termsById.get(nameTerm);
    const shape = shapeCheck(profile, term);
    next.shape_ok = shape;
    next.proposal_rule_id = rule?.rule_id ?? null;

    const dlpFamily = dlpTerm ? termsById.get(dlpTerm)?.term_family : null;
    const nameFamily = term?.term_family;
    const conflict =
      nameFamily === "identifier" &&
      dlpFamily === "pii" &&
      (profile.dominant_share ?? 0) >= 0.5 &&
      (profile.hit_rate ?? 0) >= 0.01;

    if (conflict && dlpTerm) {
      next.dlp_term_id = dlpTerm;
      next.proposed_term_id = dlpTerm;
      next.proposal_source = "conflict";
      next.proposal_reason = `Name rule ${rule?.rule_id} suggests ${nameTerm} (identifier) but DLP maps ${profile.dominant_info_type} → ${dlpTerm} (pii) with dominant_share=${profile.dominant_share?.toFixed(2)} hit_rate=${profile.hit_rate?.toFixed(3)}. Safer default is the DLP term.`;
      return next;
    }

    next.proposed_term_id = nameTerm;
    if (shape === false) {
      next.proposal_source = "name_rule_shape_mismatch";
      next.proposal_reason = `Name rule ${rule?.rule_id} (${rule?.match_type} '${rule?.pattern}' @ ${rule?.scope_type}:${rule?.scope_value}) suggests ${nameTerm}, but value sketch is outside term_catalog bounds.`;
    } else {
      next.proposal_source = "name_rule";
      next.proposal_reason = `Name rule ${rule?.rule_id} (${rule?.match_type} '${rule?.pattern}' @ ${rule?.scope_type}:${rule?.scope_value}) suggests ${nameTerm}. Name rules never apply tags.`;
    }
    if (dlpTerm) next.dlp_term_id = dlpTerm;
    return next;
  }

  if (profile.is_mixed) {
    next.proposal_source = "mixed";
    next.proposal_reason =
      "Multiple infoTypes each hold ≥20% of findings. No single business term.";
    return next;
  }

  if (profile.hit_rate != null && profile.hit_rate < 0.01) {
    next.proposal_source = "low_hit_rate";
    next.proposal_reason = `Hit rate ${(profile.hit_rate * 100).toFixed(3)}% is below 1%. Treating as noise, not a column class.`;
    return next;
  }

  if (dlpTerm) {
    next.dlp_term_id = dlpTerm;
    next.proposed_term_id = dlpTerm;
    next.proposal_source = "dlp_map";
    next.proposal_reason = `Dominant infoType ${profile.dominant_info_type} maps to ${dlpTerm} (priority ${dlpMapped?.priority}).`;
    return next;
  }

  if (profile.dominant_info_type) {
    next.proposal_source = "unmapped";
    next.proposal_reason = `Dominant infoType ${profile.dominant_info_type} has no row in info_type_map.`;
    return next;
  }

  next.proposal_source = "unmapped";
  next.proposal_reason =
    "No name-rule hit and no DLP findings to map. Left for a later (non-LLM in this slice) job.";
  return next;
}

export function applyProposals(
  profiles: ColumnProfile[],
  args: {
    terms: Term[];
    infoTypeMap: InfoTypeMap[];
    rules: ColumnNameRule[];
    negatives: NameRuleNegative[];
    decisions: ApprovedDecision[];
  },
): ColumnProfile[] {
  return profiles.map((p) => proposeForProfile(p, args));
}
