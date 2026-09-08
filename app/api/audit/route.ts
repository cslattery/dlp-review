import { json } from "@/lib/http";
import { loadStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fqn = url.searchParams.get("fqn");
  const store = loadStore();
  const rows = fqn
    ? store.review_audit.filter((a) => a.column_fqn === fqn)
    : store.review_audit;
  return json({ rows });
}
