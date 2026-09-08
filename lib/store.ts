import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type {
  ApprovedDecision,
  ColumnDetail,
  ColumnNameRule,
  DriftEvent,
  GovStore,
  NameRuleNegative,
  QueueFilters,
  QueueRow,
  ReviewAudit,
} from "./types";

const SEED_DIR = path.join(process.cwd(), "seed");
const DATA_DIR = path.join(process.cwd(), ".data");

const MUTABLE = [
  "approved_decisions",
  "drift_events",
  "review_audit",
  "column_name_rules",
  "column_name_rule_negatives",
] as const;

type MutableKey = (typeof MUTABLE)[number];

function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function seedPath(name: string): string {
  return path.join(SEED_DIR, `${name}.json`);
}

function dataPath(name: string): string {
  return path.join(DATA_DIR, `${name}.json`);
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  for (const key of MUTABLE) {
    if (!existsSync(dataPath(key)) && existsSync(seedPath(key))) {
      writeFileSync(dataPath(key), readFileSync(seedPath(key)));
    }
  }
}

export function loadStore(): GovStore {
  ensureDataDir();
  return {
    dlp_findings: readJson(seedPath("dlp_findings"), []),
    column_metadata: readJson(seedPath("column_metadata"), []),
    term_catalog: readJson(seedPath("term_catalog"), []),
    info_type_map: readJson(seedPath("info_type_map"), []),
    column_name_rules: readJson(dataPath("column_name_rules"), readJson(seedPath("column_name_rules"), [])),
    column_name_rule_negatives: readJson(
      dataPath("column_name_rule_negatives"),
      readJson(seedPath("column_name_rule_negatives"), []),
    ),
    column_profiles: readJson(seedPath("column_profiles"), []),
    approved_decisions: readJson(
      dataPath("approved_decisions"),
      readJson(seedPath("approved_decisions"), []),
    ),
    drift_events: readJson(dataPath("drift_events"), readJson(seedPath("drift_events"), [])),
    review_audit: readJson(dataPath("review_audit"), readJson(seedPath("review_audit"), [])),
  };
}

export function persistMutable(store: GovStore): void {
  ensureDataDir();
  const payload: Record<MutableKey, unknown> = {
    approved_decisions: store.approved_decisions,
    drift_events: store.drift_events,
    review_audit: store.review_audit,
    column_name_rules: store.column_name_rules,
    column_name_rule_negatives: store.column_name_rule_negatives,
  };
  for (const key of MUTABLE) {
    writeFileSync(dataPath(key), JSON.stringify(payload[key], null, 2) + "\n");
  }
}

export function dataSource(): "bigquery" | "seed" {
  if (process.env.BQ_PROJECT && process.env.BQ_DATASET === "gov_dlp") {
    return "bigquery";
  }
  return "seed";
}

export function latestScanId(store: GovStore): string | null {
  const scans = store.column_profiles.map((p) => ({
    id: p.scan_id,
    at: p.profiled_at,
  }));
  if (scans.length === 0) return null;
  scans.sort((a, b) => (a.at < b.at ? 1 : -1));
  return scans[0].id;
}

export function getQueue(store: GovStore, filters: QueueFilters = {}): QueueRow[] {
  const latest = latestScanId(store);
  const terms = new Map(store.term_catalog.map((t) => [t.term_id, t]));
  const profiles = new Map(
    store.column_profiles
      .filter((p) => !latest || p.scan_id === latest)
      .map((p) => [p.column_fqn, p]),
  );
  const status = filters.status ?? "default";
  const q = (filters.q ?? "").trim().toLowerCase();

  return store.drift_events
    .filter((e) => {
      if (status === "default") {
        if (e.event_type === "CONFIRMED" || e.event_type === "REJECTED_REPEAT") {
          return false;
        }
        return e.status === "open";
      }
      if (status !== "all" && e.status !== status) return false;
      return true;
    })
    .filter((e) => !filters.event_type || e.event_type === filters.event_type)
    .filter((e) => !filters.proposal_source || e.proposal_source === filters.proposal_source)
    .filter((e) => !filters.upgrades_only || e.event_type === "TERM_UPGRADE")
    .filter((e) => {
      if (!q) return true;
      return (
        e.column_fqn.toLowerCase().includes(q) ||
        e.event_type.toLowerCase().includes(q) ||
        (e.proposed_term_id ?? "").toLowerCase().includes(q)
      );
    })
    .map((event) => {
      const profile = profiles.get(event.column_fqn) ?? null;
      if (filters.dataset && profile && profile.dataset_id !== filters.dataset) {
        return null;
      }
      if (filters.dataset && !profile) return null;
      const created = new Date(event.created_at).getTime();
      return {
        event,
        profile,
        previous_term: event.previous_term_id
          ? terms.get(event.previous_term_id) ?? null
          : null,
        proposed_term: event.proposed_term_id
          ? terms.get(event.proposed_term_id) ?? null
          : null,
        table_id: profile?.table_id ?? event.column_fqn.split(".")[2] ?? "",
        field_name: profile?.field_name ?? event.column_fqn.split(".").slice(3).join("."),
        dataset_id: profile?.dataset_id ?? event.column_fqn.split(".")[1] ?? "",
        hit_rate: profile?.hit_rate ?? null,
        dominant_info_type: profile?.dominant_info_type ?? null,
        age_hours: Math.max(0, (Date.now() - created) / 36e5),
      } satisfies QueueRow;
    })
    .filter((r): r is QueueRow => r !== null)
    .sort((a, b) => {
      const hot = (t: string) =>
        t === "CONFLICT" || t === "SCHEMA_DRIFT" || t === "TERM_UPGRADE" ? 0 : 1;
      const ha = hot(a.event.event_type);
      const hb = hot(b.event.event_type);
      if (ha !== hb) return ha - hb;
      return a.event.column_fqn.localeCompare(b.event.column_fqn);
    });
}

export function getColumnDetail(store: GovStore, fqn: string): ColumnDetail | null {
  const profiles = store.column_profiles
    .filter((p) => p.column_fqn === fqn)
    .sort((a, b) => (a.profiled_at < b.profiled_at ? 1 : -1));
  const latest = profiles[0] ?? null;
  const previous = profiles[1] ?? null;
  if (!latest && !store.drift_events.some((e) => e.column_fqn === fqn)) return null;

  const events = store.drift_events
    .filter((e) => e.column_fqn === fqn)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const event = events.find((e) => e.status === "open") ?? events[0] ?? null;
  const decision =
    store.approved_decisions.find((d) => d.column_fqn === fqn) ?? null;
  const metadata =
    store.column_metadata.find((m) => {
      const mf = `${m.project_id}.${m.dataset_id}.${m.table_id}.${m.field_path}`;
      const mc = `${m.project_id}.${m.dataset_id}.${m.table_id}.${m.column_name}`;
      return mf === fqn || mc === fqn;
    }) ?? null;
  const terms = store.term_catalog.filter((t) => t.active);
  const proposed_term = latest?.proposed_term_id
    ? terms.find((t) => t.term_id === latest.proposed_term_id) ?? null
    : event?.proposed_term_id
      ? terms.find((t) => t.term_id === event.proposed_term_id) ?? null
      : null;
  const previous_term = decision?.term_id
    ? terms.find((t) => t.term_id === decision.term_id) ?? null
    : null;
  const matched_rule = latest?.proposal_rule_id
    ? store.column_name_rules.find((r) => r.rule_id === latest.proposal_rule_id) ??
      null
    : null;

  return {
    fqn,
    metadata,
    latest,
    previous,
    decision,
    event,
    events,
    proposed_term,
    previous_term,
    dlp_term: latest?.dlp_term_id
      ? terms.find((t) => t.term_id === latest.dlp_term_id) ?? null
      : null,
    name_rule_term: latest?.name_rule_term_id
      ? terms.find((t) => t.term_id === latest.name_rule_term_id) ?? null
      : null,
    matched_rule,
    terms,
  };
}

export function datasetsInQueue(store: GovStore): string[] {
  return [...new Set(store.column_profiles.map((p) => p.dataset_id))].sort();
}

export type { ApprovedDecision, ColumnNameRule, DriftEvent, NameRuleNegative, ReviewAudit };
