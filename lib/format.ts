import type { EventType, ProposalSource } from "./types";

export function formatHitRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "—";
  if (rate === 0) return "0%";
  if (rate < 0.01) return `${(rate * 100).toFixed(3)}%`;
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function sensitivityDelta(
  prev: number | null | undefined,
  next: number | null | undefined,
): string {
  if (prev == null && next == null) return "—";
  if (prev == null) return `→ ${next}`;
  if (next == null) return `${prev} → —`;
  const d = next - prev;
  if (d === 0) return `${prev}`;
  return `${prev} → ${next} (${d > 0 ? "+" : ""}${d})`;
}

export function eventTone(
  type: EventType,
): "hot" | "cool" | "neutral" | "muted" | "warn" {
  switch (type) {
    case "TERM_UPGRADE":
    case "CONFLICT":
    case "SCHEMA_DRIFT":
      return "hot";
    case "TERM_DOWNGRADE":
    case "UNTAG_CANDIDATE":
      return "cool";
    case "NAME_RULE_NEW":
    case "SHAPE_MISMATCH":
      return "neutral";
    case "CONFIRMED":
    case "REJECTED_REPEAT":
      return "muted";
    default:
      return "warn";
  }
}

export function sourceLabel(source: ProposalSource | null | undefined): string {
  if (!source) return "—";
  return source.replaceAll("_", " ");
}

export function eventLabel(type: EventType): string {
  return type.replaceAll("_", " ");
}
