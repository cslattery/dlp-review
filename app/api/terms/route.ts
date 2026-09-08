import { json } from "@/lib/http";
import { loadStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = loadStore();
  return json({
    terms: store.term_catalog,
    rules: store.column_name_rules,
    negatives: store.column_name_rule_negatives,
    info_type_map: store.info_type_map,
  });
}
