import { fail, json, readBody } from "@/lib/http";
import { approveEvent } from "@/lib/review";
import { loadStore, persistMutable } from "@/lib/store";
import type { LockPolicy } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await readBody<{ notes?: string; lock_policy?: LockPolicy }>(req);
  try {
    const store = loadStore();
    const result = approveEvent(store, id, body);
    persistMutable(store);
    return json({ ok: true, ...result });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Approve failed");
  }
}
