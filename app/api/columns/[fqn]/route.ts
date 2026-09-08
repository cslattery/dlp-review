import { fail, json } from "@/lib/http";
import { getColumnDetail, loadStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ fqn: string }> },
) {
  const { fqn } = await ctx.params;
  const decoded = decodeURIComponent(fqn);
  const detail = getColumnDetail(loadStore(), decoded);
  if (!detail) return fail(`Unknown column ${decoded}`, 404);
  return json({ column: detail });
}
