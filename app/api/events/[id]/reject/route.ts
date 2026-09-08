import { fail, json, readBody } from "@/lib/http";
import { rejectEvent } from "@/lib/review";
import { loadStore, persistMutable } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await readBody<{ notes?: string; never_suggest?: boolean }>(req);
  try {
    const store = loadStore();
    const result = rejectEvent(store, id, body);
    persistMutable(store);
    return json({ ok: true, ...result });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Reject failed");
  }
}
