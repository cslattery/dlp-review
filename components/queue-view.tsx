"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EventBadge, SourceBadge } from "@/components/event-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAge, formatHitRate, sensitivityDelta } from "@/lib/format";
import type { EventType, ProposalSource, QueueRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const EVENT_TYPES: EventType[] = [
  "NEW_UNTAGGED",
  "NAME_RULE_NEW",
  "TERM_UPGRADE",
  "TERM_DOWNGRADE",
  "UNTAG_CANDIDATE",
  "SCHEMA_DRIFT",
  "CONFLICT",
  "SHAPE_MISMATCH",
  "MIXED",
  "NEEDS_REVIEW",
  "TAXONOMY_ONLY",
  "CONFIRMED",
  "REJECTED_REPEAT",
];

const SOURCES: ProposalSource[] = [
  "dlp_map",
  "name_rule",
  "name_rule_shape_mismatch",
  "conflict",
  "mixed",
  "low_hit_rate",
  "unmapped",
];

type Payload = {
  rows: QueueRow[];
  datasets: string[];
};

export function QueueView() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [eventType, setEventType] = useState("");
  const [source, setSource] = useState("");
  const [dataset, setDataset] = useState("");
  const [upgradesOnly, setUpgradesOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (eventType) p.set("event_type", eventType);
    if (source) p.set("proposal_source", source);
    if (dataset) p.set("dataset", dataset);
    if (upgradesOnly) p.set("upgrades_only", "1");
    p.set("status", showHidden ? "all" : "default");
    return p.toString();
  }, [q, eventType, source, dataset, upgradesOnly, showHidden]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/queue?${query}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Failed to load queue");
        if (!cancelled) {
          setError(null);
          setData(body);
          setSelected(0);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "j") {
        e.preventDefault();
        setSelected((i) => Math.min(rows.length - 1, i + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setSelected((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" && rows[selected]) {
        router.push(`/columns/${encodeURIComponent(rows[selected].event.column_fqn)}`);
      } else if (e.key === "a" && rows[selected]) {
        router.push(`/columns/${encodeURIComponent(rows[selected].event.column_fqn)}?intent=approve`);
      } else if (e.key === "r" && rows[selected]) {
        router.push(`/columns/${encodeURIComponent(rows[selected].event.column_fqn)}?intent=reject`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selected, router]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Steward queue</h2>
          <p className="text-sm text-muted-foreground">
            Open drift only. CONFIRMED and REJECTED_REPEAT stay hidden unless you
            ask for them. <kbd className="rounded border px-1">j</kbd>/
            <kbd className="rounded border px-1">k</kbd> move,{" "}
            <kbd className="rounded border px-1">a</kbd> approve,{" "}
            <kbd className="rounded border px-1">r</kbd> reject.
          </p>
        </div>
        <Badge variant="outline" className="w-fit font-mono">
          {rows.length} shown
        </Badge>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="lg:col-span-2">
          <span className="mb-1 block text-xs text-muted-foreground">Search FQN</span>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="myproj.ran_prod.sites.site_id"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">Event type</span>
          <Select value={eventType || "__all"} onValueChange={(v) => setEventType(v === "__all" ? "" : (v ?? ""))}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All types</SelectItem>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">Source</span>
          <Select value={source || "__all"} onValueChange={(v) => setSource(v === "__all" ? "" : (v ?? ""))}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All sources</SelectItem>
              {SOURCES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">Dataset</span>
          <Select value={dataset || "__all"} onValueChange={(v) => setDataset(v === "__all" ? "" : (v ?? ""))}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All datasets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All datasets</SelectItem>
              {(data?.datasets ?? []).map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="flex flex-col justify-end gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={upgradesOnly}
              onCheckedChange={(v) => setUpgradesOnly(v === true)}
              id="up"
            />
            <Label htmlFor="up" className="text-xs">
              Upgrades only
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={showHidden}
              onCheckedChange={(v) => setShowHidden(v === true)}
              id="hid"
            />
            <Label htmlFor="hid" className="text-xs">
              Show confirmed / repeats
            </Label>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!data && !error && (
        <div className="rounded-xl border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
          Loading the latest scan…
        </div>
      )}

      {data && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-16 text-center">
          <p className="font-medium">Queue is clear for this filter</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No open drift matches. Turn on “Show confirmed / repeats” to see
            CONFIRMED and REJECTED_REPEAT, or clear filters.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => {
            setQ("");
            setEventType("");
            setSource("");
            setDataset("");
            setUpgradesOnly(false);
            setShowHidden(true);
          }}>
            Show hidden events
          </Button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Previous</TableHead>
                <TableHead>Proposed</TableHead>
                <TableHead>Sensitivity</TableHead>
                <TableHead>Hit</TableHead>
                <TableHead>Dominant</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow
                  key={row.event.event_id}
                  data-state={i === selected ? "selected" : undefined}
                  className={cn(i === selected && "bg-muted/70")}
                  onClick={() => setSelected(i)}
                >
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/columns/${encodeURIComponent(row.event.column_fqn)}`}
                      className="hover:underline"
                    >
                      {row.dataset_id}.{row.table_id}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.field_name}</TableCell>
                  <TableCell>
                    <EventBadge type={row.event.event_type} />
                  </TableCell>
                  <TableCell>
                    <SourceBadge source={row.event.proposal_source} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.previous_term?.display_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.proposed_term?.display_name ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {sensitivityDelta(
                      row.event.previous_sensitivity_rank,
                      row.event.proposed_sensitivity_rank,
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatHitRate(row.hit_rate)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.dominant_info_type ?? "—"}
                  </TableCell>
                  <TableCell>
                    {row.event.material_change ? (
                      <Badge variant="destructive">yes</Badge>
                    ) : (
                      <span className="text-muted-foreground">no</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatAge(row.age_hours)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
