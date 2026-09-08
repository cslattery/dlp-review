import { fail, json, readBody } from "@/lib/http";
import { approveEvent, promoteRule } from "@/lib/review";
import { loadStore, persistMutable } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await readBody<{
    scope_type?: "dataset" | "project" | "org";
    notes?: string;
    approve_first?: boolean;
  }>(req);
  try {
    const store = loadStore();
    if (body.approve_first) {
      approveEvent(store, id, { notes: body.notes });
    }
    const result = promoteRule(store, id, body);
    persistMutable(store);
    return json({ ok: true, ...result });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Promote failed");
  }
}
