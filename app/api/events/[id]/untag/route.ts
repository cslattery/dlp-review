import { fail, json, readBody } from "@/lib/http";
import { untagEvent } from "@/lib/review";
import { loadStore, persistMutable } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await readBody<{ notes?: string }>(req);
  if (!body.notes?.trim()) {
    return fail("A note is required to approve an untag.");
  }
  try {
    const store = loadStore();
    const result = untagEvent(store, id, { notes: body.notes.trim() });
    persistMutable(store);
    return json({ ok: true, ...result });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Untag failed");
  }
}
