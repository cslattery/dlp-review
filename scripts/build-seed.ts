import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { emitDriftEvents } from "../lib/drift";
import {
  CURRENT_FINDING_SPECS,
  FINDING_PREV,
  FINDING_TIME,
  INFO_TYPE_MAP,
  METADATA,
  NAME_RULES,
  NEGATIVES,
  PREV_FINDING_SPECS,
  PREV_METADATA_OVERRIDES,
  PROFILED_AT,
  PROFILED_PREV,
  SCAN_CURRENT,
  SCAN_PREV,
  TERMS,
  expandFindings,
  seedDecisions,
} from "../lib/fixtures";
import { applyProposals } from "../lib/propose";
import { buildColumnProfiles } from "../lib/profile";
import type { ColumnMetadata, ColumnProfile } from "../lib/types";

function mergeMeta(
  base: ColumnMetadata[],
  overrides: Record<string, Partial<ColumnMetadata>>,
): ColumnMetadata[] {
  return base.map((m) => {
    const fqn = `${m.project_id}.${m.dataset_id}.${m.table_id}.${m.field_path}`;
    const extra = overrides[fqn];
    return extra ? { ...m, ...extra } : m;
  });
}

function write(dir: string, name: string, data: unknown) {
  writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + "\n");
}

function main() {
  const seedDir = path.join(process.cwd(), "seed");
  mkdirSync(seedDir, { recursive: true });

  const currentFindings = expandFindings(
    CURRENT_FINDING_SPECS,
    SCAN_CURRENT,
    FINDING_TIME,
  );
  const prevFindings = expandFindings(
    PREV_FINDING_SPECS,
    SCAN_PREV,
    FINDING_PREV,
  );

  let currentProfiles = buildColumnProfiles({
    findings: currentFindings,
    metadata: METADATA,
    scanId: SCAN_CURRENT,
    profiledAt: PROFILED_AT,
  });
  let prevProfiles = buildColumnProfiles({
    findings: prevFindings,
    metadata: mergeMeta(METADATA, PREV_METADATA_OVERRIDES),
    scanId: SCAN_PREV,
    profiledAt: PROFILED_PREV,
  });

  const emptyDecisions: never[] = [];
  const proposeArgs = {
    terms: TERMS,
    infoTypeMap: INFO_TYPE_MAP,
    rules: NAME_RULES,
    negatives: NEGATIVES,
    decisions: emptyDecisions,
  };
  currentProfiles = applyProposals(currentProfiles, proposeArgs);
  prevProfiles = applyProposals(prevProfiles, proposeArgs).filter(
    (p) => p.findings_total > 0,
  );

  const fpSource = (p: ColumnProfile) => ({
    fqn: p.column_fqn,
    dlp: p.dlp_fingerprint,
    value: p.value_fingerprint,
    dlp_payload: p.dlp_payload,
    value_payload: p.value_payload,
    scan_id: p.scan_id,
  });

  const decisionFps = [
    "myproj.customers.customers.email_stable",
    "myproj.customers.customers.legacy_id",
    "myproj.kyc.subjects.national_id",
    "myproj.customers.customers.retired_email",
    "myproj.customers.customers.notes_free",
    "myproj.customers.customers.mobile",
  ].map((fqn) => {
    const prev = prevProfiles.find((p) => p.column_fqn === fqn);
    const curr = currentProfiles.find((p) => p.column_fqn === fqn);
    const src = prev ?? curr;
    if (!src) throw new Error(`Missing profile for ${fqn}`);
    return fpSource(src);
  });

  const decisions = seedDecisions(decisionFps);
  const events = emitDriftEvents({
    profiles: currentProfiles,
    decisions,
    terms: TERMS,
    existingEvents: [],
    previousProfiles: prevProfiles,
    now: new Date(PROFILED_AT),
  });

  write(seedDir, "term_catalog.json", TERMS);
  write(seedDir, "info_type_map.json", INFO_TYPE_MAP);
  write(seedDir, "column_name_rules.json", NAME_RULES);
  write(seedDir, "column_name_rule_negatives.json", NEGATIVES);
  write(seedDir, "column_metadata.json", METADATA);
  write(seedDir, "dlp_findings.json", [...prevFindings, ...currentFindings]);
  write(seedDir, "column_profiles.json", [...prevProfiles, ...currentProfiles]);
  write(seedDir, "approved_decisions.json", decisions);
  write(seedDir, "drift_events.json", events);
  write(seedDir, "review_audit.json", []);

  const summary = events.map((e) => ({
    type: e.event_type,
    status: e.status,
    fqn: e.column_fqn,
    source: e.proposal_source,
    prev: e.previous_term_id,
    proposed: e.proposed_term_id,
    material: e.material_change,
  }));
  console.log(JSON.stringify(summary, null, 2));
  console.log(
    `profiles current=${currentProfiles.length} prev=${prevProfiles.length} events=${events.length} findings=${currentFindings.length + prevFindings.length}`,
  );
}

main();
