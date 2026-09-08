import { fail, json, readBody } from "@/lib/http";
import { stubApplyTag } from "@/lib/review";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readBody<{
    column_fqn?: string;
    policy_tag_resource?: string;
  }>(req);
  if (!body.column_fqn || !body.policy_tag_resource) {
    return fail("column_fqn and policy_tag_resource are required");
  }
  return json(stubApplyTag({
    column_fqn: body.column_fqn,
    policy_tag_resource: body.policy_tag_resource,
  }));
}
