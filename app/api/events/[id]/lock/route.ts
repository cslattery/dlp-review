import { fail, json, readBody } from "@/lib/http";
import { setLockPolicy } from "@/lib/review";
import { loadStore, persistMutable } from "@/lib/store";
import type { LockPolicy } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await readBody<{ lock_policy?: LockPolicy; notes?: string }>(req);
  if (!body.lock_policy) return fail("lock_policy is required");
  try {
    const store = loadStore();
    const result = setLockPolicy(store, id, body.lock_policy, body.notes);
    persistMutable(store);
    return json({ ok: true, ...result });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Lock update failed");
  }
}
