/** Column-name normalisation — mirrors gov_dlp.normalize_column_name JS UDF. */
export function normalizeColumnName(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  let s = String(raw).trim();
  s = s.replace(/[-.\s]+/g, "_");
  s = s.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  s = s.toLowerCase();
  s = s.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return s;
}

/** Last 1–2 dotted segments, each normalised, joined with `_`. */
export function fieldPathSuffix(fieldName: string | null | undefined): string {
  if (!fieldName) return "";
  const segs = String(fieldName)
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  const take = segs.slice(-2);
  return take.map((p) => normalizeColumnName(p)).join("_");
}

export function columnFqn(
  projectId: string,
  datasetId: string,
  tableId: string,
  fieldName: string,
): string {
  return `${projectId}.${datasetId}.${tableId}.${fieldName}`;
}
