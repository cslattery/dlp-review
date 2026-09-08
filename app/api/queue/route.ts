import { datasetsInQueue, getQueue, loadStore } from "@/lib/store";
import { json } from "@/lib/http";
import type { EventStatus, EventType, ProposalSource, QueueFilters } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filters: QueueFilters = {
    status: (url.searchParams.get("status") as EventStatus | "all" | "default") || "default",
    event_type: (url.searchParams.get("event_type") as EventType) || "",
    proposal_source: (url.searchParams.get("proposal_source") as ProposalSource) || "",
    dataset: url.searchParams.get("dataset") || "",
    upgrades_only: url.searchParams.get("upgrades_only") === "1",
    q: url.searchParams.get("q") || "",
  };
  const store = loadStore();
  return json({
    rows: getQueue(store, filters),
    datasets: datasetsInQueue(store),
    filters,
  });
}
