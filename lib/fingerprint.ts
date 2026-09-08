import { createHash } from "crypto";
import type {
  DlpPayload,
  HitBand,
  HistogramBucket,
  NdvBand,
  ValuePayload,
} from "./types";

export function hitBand(rate: number | null | undefined): HitBand {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return null;
  if (rate < 0.01) return "lt_1pct";
  if (rate < 0.1) return "1_10pct";
  if (rate < 0.5) return "10_50pct";
  return "ge_50pct";
}

export function ndvBand(ndv: number | null | undefined): NdvBand {
  if (ndv === null || ndv === undefined || Number.isNaN(ndv)) return null;
  if (ndv <= 1) return "1";
  if (ndv <= 10) return "2_10";
  if (ndv <= 100) return "11_100";
  if (ndv <= 1000) return "101_1k";
  return "1k_plus";
}

export function round2(n: number | null | undefined): number | null {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

/** Stable JSON matching the BigQuery payload contract (explicit key order). */
export function dlpPayloadJson(payload: DlpPayload): string {
  return JSON.stringify({
    dominant_info_type: payload.dominant_info_type,
    is_mixed: payload.is_mixed,
    dominant_share: payload.dominant_share,
    hit_band: payload.hit_band,
    top_info_types: payload.top_info_types.map((t) => ({
      info_type: t.info_type,
      share: t.share,
    })),
  });
}

export function valuePayloadJson(payload: ValuePayload): string {
  return JSON.stringify({
    null_rate_band: payload.null_rate_band,
    ndv_band: payload.ndv_band,
    length_p50: payload.length_p50,
    top_value_hashes: [...payload.top_value_hashes].sort(),
  });
}

/**
 * Offline stand-in for FARM_FINGERPRINT(TO_JSON_STRING(...)).
 * BigQuery uses FarmHash Fingerprint64; this slice uses a stable SHA-256 fold
 * so seed data is reproducible without the BQ function.
 */
export function fingerprintJson(json: string): number {
  const h = createHash("sha256").update(json).digest();
  return h.readUInt32BE(0) * 0x1000000 + h.readUIntBE(4, 3);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildDlpPayload(args: {
  dominant_info_type: string | null;
  is_mixed: boolean;
  dominant_share: number | null;
  hit_rate: number | null;
  histogram: HistogramBucket[];
  findings_total: number;
}): DlpPayload {
  const top = [...args.histogram]
    .sort((a, b) => b.findings - a.findings || a.info_type.localeCompare(b.info_type))
    .slice(0, 3)
    .map((b) => ({
      info_type: b.info_type,
      share: args.findings_total
        ? (round2(b.findings / args.findings_total) as number)
        : 0,
    }));
  return {
    dominant_info_type: args.dominant_info_type,
    is_mixed: args.is_mixed,
    dominant_share: round2(args.dominant_share),
    hit_band: hitBand(args.hit_rate),
    top_info_types: top,
  };
}

export function buildValuePayload(args: {
  null_rate: number | null;
  approx_ndv: number | null;
  length_p50: number | null;
  hashes: string[];
}): ValuePayload {
  const length =
    args.length_p50 === null || args.length_p50 === undefined
      ? null
      : Math.round(args.length_p50);
  return {
    null_rate_band: hitBand(args.null_rate),
    ndv_band: ndvBand(args.approx_ndv),
    length_p50: length,
    top_value_hashes: [...new Set(args.hashes)].sort().slice(0, 20),
  };
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 1 : inter / union;
}

export function hitRateMaterial(
  prev: number | null | undefined,
  curr: number | null | undefined,
): boolean {
  if (prev === null || prev === undefined || curr === null || curr === undefined) {
    return prev !== curr;
  }
  if (prev > 0 && (curr / prev >= 2 || prev / curr >= 2)) return true;
  const crossed =
    prev < 0.01 !== curr < 0.01 || prev < 0.1 !== curr < 0.1;
  return crossed;
}

export function valueSketchMaterial(
  prev: ValuePayload | null | undefined,
  curr: ValuePayload | null | undefined,
): boolean {
  if (!prev || !curr) return Boolean(prev) !== Boolean(curr);
  if (prev.null_rate_band !== curr.null_rate_band) return true;
  if (prev.ndv_band !== curr.ndv_band) return true;
  if (prev.length_p50 !== curr.length_p50) return true;
  return jaccard(prev.top_value_hashes, curr.top_value_hashes) < 0.5;
}
