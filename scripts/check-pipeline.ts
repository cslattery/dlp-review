import { readFileSync } from "fs";
import path from "path";
import type { DriftEvent } from "../lib/types";

const required: DriftEvent["event_type"][] = [
  "NAME_RULE_NEW",
  "SHAPE_MISMATCH",
  "CONFLICT",
  "SCHEMA_DRIFT",
  "TERM_UPGRADE",
  "TERM_DOWNGRADE",
  "UNTAG_CANDIDATE",
  "REJECTED_REPEAT",
  "CONFIRMED",
  "MIXED",
  "NEW_UNTAGGED",
];

const events = JSON.parse(
  readFileSync(path.join(process.cwd(), "seed/drift_events.json"), "utf8"),
) as DriftEvent[];
const types = new Set(events.map((e) => e.event_type));
const missing = required.filter((t) => !types.has(t));
if (missing.length) {
  console.error("Missing event types in seed:", missing);
  process.exit(1);
}

const open = events.filter((e) => e.status === "open").length;
if (open < 8) {
  console.error("Expected a populated open queue, got", open);
  process.exit(1);
}

console.log(`ok: ${events.length} events, ${open} open, types=${[...types].sort().join(",")}`);
