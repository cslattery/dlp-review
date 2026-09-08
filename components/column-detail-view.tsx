"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EventBadge, SourceBadge } from "@/components/event-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatHitRate, sensitivityDelta } from "@/lib/format";
import type { ColumnDetail, DlpPayload, LockPolicy, QueueRow, ValuePayload } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ColumnDetailView({
  fqn,
  intent,
}: {
  fqn: string;
  intent?: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<ColumnDetail | null>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [overrideTerm, setOverrideTerm] = useState("");
  const [lockPolicy, setLockPolicy] = useState<LockPolicy>("lock");
  const [neverSuggest, setNeverSuggest] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteScope, setPromoteScope] = useState<"dataset" | "project">("dataset");

  async function reload() {
    const [col, q] = await Promise.all([
      fetch(`/api/columns/${encodeURIComponent(fqn)}`).then((r) => r.json()),
      fetch("/api/queue?status=default").then((r) => r.json()),
    ]);
    if (col.error) throw new Error(col.error);
    setDetail(col.column);
    setQueue(q.rows ?? []);
    if (col.column?.proposed_term && !overrideTerm) {
      setOverrideTerm(col.column.proposed_term.term_id);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/columns/${encodeURIComponent(fqn)}`)
      .then((r) => r.json())
      .then((col) => {
        if (cancelled) return;
        if (col.error) throw new Error(col.error);
        setDetail(col.column);
        if (col.column?.proposed_term) {
          setOverrideTerm(col.column.proposed_term.term_id);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    fetch("/api/queue?status=default")
      .then((r) => r.json())
      .then((q) => {
        if (!cancelled) setQueue(q.rows ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fqn]);

  const neighbors = useMemo(() => {
    const idx = queue.findIndex((r) => r.event.column_fqn === fqn);
    return {
      prev: idx > 0 ? queue[idx - 1] : null,
      next: idx >= 0 && idx < queue.length - 1 ? queue[idx + 1] : null,
    };
  }, [queue, fqn]);

  const event = detail?.event;
  const latest = detail?.latest;
  const needsNote =
    event?.event_type === "TERM_DOWNGRADE" ||
    event?.event_type === "UNTAG_CANDIDATE" ||
    event?.event_type === "CONFLICT";
  const nameRule = Boolean(latest?.proposal_source?.startsWith("name_rule"));
  const open = event?.status === "open";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "j" && neighbors.next) {
        router.push(`/columns/${encodeURIComponent(neighbors.next.event.column_fqn)}`);
      } else if (e.key === "k" && neighbors.prev) {
        router.push(`/columns/${encodeURIComponent(neighbors.prev.event.column_fqn)}`);
      } else if (e.key === "a" && open) {
        void act("approve");
      } else if (e.key === "r" && open) {
        void act("reject");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neighbors, open, notes, neverSuggest, lockPolicy]);

  async function act(kind: "approve" | "override" | "reject" | "untag" | "lock" | "promote") {
    if (!event) return;
    if (needsNote && !notes.trim() && (kind === "approve" || kind === "override" || kind === "untag")) {
      setError("A review note is required for downgrade, untag, or conflict.");
      return;
    }
    if (kind === "untag" && !notes.trim()) {
      setError("A note is required to approve an untag.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const path =
        kind === "promote"
          ? `/api/events/${event.event_id}/promote-rule`
          : `/api/events/${event.event_id}/${kind === "lock" ? "lock" : kind}`;
      const body =
        kind === "approve"
          ? { notes, lock_policy: lockPolicy }
          : kind === "override"
            ? { term_id: overrideTerm, notes, lock_policy: lockPolicy }
            : kind === "reject"
              ? { notes, never_suggest: neverSuggest }
              : kind === "untag"
                ? { notes }
                : kind === "lock"
                  ? { lock_policy: lockPolicy, notes }
                  : { scope_type: promoteScope, notes, approve_first: true };
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");
      setMessage(
        kind === "promote"
          ? `Approved and promoted ${json.rule?.rule_id} (auto-apply stays false).`
          : kind === "reject"
            ? "Rejected. This FQN will stay quiet for 7 days unless the fingerprint upgrades."
            : "Decision recorded. Apply-tag remains stubbed until a later job.",
      );
      setPromoteOpen(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !detail) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm">
        {error}
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-16 text-center text-sm text-muted-foreground">
        Loading column profile…
      </div>
    );
  }

  const live = latest?.existing_policy_tag ?? detail.metadata?.existing_policy_tag;
  const approvedTag = detail.decision?.policy_tag_resource;
  const schemaDrift = Boolean(live && approvedTag && live !== approvedTag);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/" className="text-xs text-muted-foreground hover:underline">
            ← Queue
          </Link>
          <h2 className="mt-1 font-mono text-base font-semibold break-all sm:text-lg">
            {detail.fqn}
          </h2>
          <p className="text-sm text-muted-foreground">
            {latest?.data_type ?? detail.metadata?.data_type ?? "unknown type"}
            {latest?.column_description || detail.metadata?.description
              ? ` · ${latest?.column_description || detail.metadata?.description}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {event && <EventBadge type={event.event_type} />}
          {latest && <SourceBadge source={latest.proposal_source} />}
          {event?.status && (
            <Badge variant="outline" className="font-mono">
              {event.status}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Live tag vs approved</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 font-mono text-xs break-all">
            <p>
              <span className="text-muted-foreground">Live · </span>
              {live ?? "none"}
            </p>
            <p>
              <span className="text-muted-foreground">Approved · </span>
              {approvedTag ?? "none"}
            </p>
            {schemaDrift && (
              <p className="rounded-md bg-red-500/10 px-2 py-1 text-red-700 dark:text-red-300">
                SCHEMA_DRIFT: someone changed the BigQuery tag outside this review.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Current approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              {detail.decision
                ? `${detail.decision.status} · ${detail.previous_term?.display_name ?? "no term"}`
                : "No steward decision yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              lock_policy = {detail.decision?.lock_policy ?? "—"} · default new
              approvals use lock
            </p>
            {detail.decision?.do_not_ask_until && (
              <p className="text-xs text-muted-foreground">
                do_not_ask_until {detail.decision.do_not_ask_until}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Proposal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">
              {detail.proposed_term?.display_name ?? "No term proposed"}
            </p>
            {latest?.proposal_source === "conflict" && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs">
                <p>
                  Name rule → <strong>{detail.name_rule_term?.display_name}</strong>
                </p>
                <p>
                  DLP → <strong>{detail.dlp_term?.display_name}</strong> (safer default)
                </p>
              </div>
            )}
            {detail.matched_rule && (
              <p className="font-mono text-[11px] text-muted-foreground">
                {detail.matched_rule.rule_id} · {detail.matched_rule.match_type}{" "}
                {detail.matched_rule.pattern} · {detail.matched_rule.scope_type}:
                {detail.matched_rule.scope_value}
                {detail.matched_rule.created_from_fqn
                  ? ` · from ${detail.matched_rule.created_from_fqn}`
                  : ""}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{latest?.proposal_reason}</p>
            <p className="font-mono text-[11px]">
              hit {formatHitRate(latest?.hit_rate ?? null)} ·{" "}
              {latest?.dominant_info_type ?? "no infoType"} · shape{" "}
              {latest?.shape_ok === null
                ? "unknown"
                : latest?.shape_ok
                  ? "ok"
                  : "mismatch"}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              sensitivity{" "}
              {sensitivityDelta(
                event?.previous_sensitivity_rank,
                event?.proposed_sensitivity_rank,
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <PayloadCard
          title="DLP histogram"
          current={latest?.dlp_payload ?? null}
          previous={
            detail.previous?.dlp_payload ??
            detail.decision?.last_dlp_payload ??
            null
          }
          histogram={latest?.info_type_histogram ?? []}
        />
        <ValueCard
          current={latest?.value_payload ?? null}
          previous={
            detail.previous?.value_payload ??
            detail.decision?.last_value_payload ??
            null
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Sample quotes
            <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">
              Potentially sensitive DLP snippets — not raw cell dumps. No copy-all.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(latest?.sample_quotes ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No quotes in this scan. Top values are stored as SHA-256 hashes only.
            </p>
          ) : (
            <ul className="space-y-1 font-mono text-xs select-none">
              {latest?.sample_quotes.map((q, i) => (
                <li key={i} className="rounded-md bg-muted px-2 py-1">
                  {q}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Value hashes ({latest?.sample_value_hashes.length ?? 0}):{" "}
            {(latest?.sample_value_hashes ?? []).slice(0, 4).join(" ") || "—"}
          </p>
        </CardContent>
      </Card>

      {open ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Review actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {intent === "approve" && (
              <p className="text-xs text-muted-foreground">
                Keyboard approve — confirm the note if this is a downgrade, untag,
                or conflict.
              </p>
            )}
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                needsNote
                  ? "Required note for downgrade / untag / conflict"
                  : "Optional steward note"
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Override term</span>
                <Select value={overrideTerm} onValueChange={(v) => setOverrideTerm(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick a catalog term" />
                  </SelectTrigger>
                  <SelectContent>
                    {detail.terms.map((t) => (
                      <SelectItem key={t.term_id} value={t.term_id}>
                        {t.display_name} ({t.sensitivity_rank})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Lock policy</span>
                <Select
                  value={lockPolicy}
                  onValueChange={(v) => setLockPolicy((v as LockPolicy) ?? "lock")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lock">lock</SelectItem>
                    <SelectItem value="allow_upgrade">allow_upgrade</SelectItem>
                    <SelectItem value="allow_untag">allow_untag</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="neg"
                checked={neverSuggest}
                onCheckedChange={(v) => setNeverSuggest(v === true)}
              />
              <Label htmlFor="neg" className="text-sm leading-snug">
                Never suggest this term for this normalised name in this dataset
              </Label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !latest?.proposed_term_id} onClick={() => act("approve")}>
                Approve proposed
              </Button>
              {nameRule && (
                <Button disabled={busy || !latest?.proposed_term_id} onClick={() => act("approve")} variant="secondary">
                  Approve this column only
                </Button>
              )}
              {nameRule && (
                <Button disabled={busy} variant="outline" onClick={() => setPromoteOpen(true)}>
                  Approve + promote rule
                </Button>
              )}
              <Button
                disabled={busy || !overrideTerm}
                variant="outline"
                onClick={() => act("override")}
              >
                Override
              </Button>
              <Button disabled={busy} variant="destructive" onClick={() => act("reject")}>
                Reject
              </Button>
              <Button disabled={busy} variant="outline" onClick={() => act("untag")}>
                Approve untag
              </Button>
              <Button
                disabled={busy || !detail.decision}
                variant="ghost"
                onClick={() => act("lock")}
              >
                Set lock policy
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          This event is {event?.status ?? "closed"}. Open events for the same FQN
          are not duplicated on the next scan.
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">{message}</p>
      )}

      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote a name rule?</DialogTitle>
            <DialogDescription>
              This first approves the column, then writes an exact_normalized rule
              for <span className="font-mono">{latest?.name_normalized}</span>.
              allow_auto_apply stays false. Wider than dataset needs an explicit
              scope.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={promoteScope}
            onValueChange={(v) => setPromoteScope((v as "dataset" | "project") ?? "dataset")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dataset">
                Dataset {latest ? `${latest.project_id}.${latest.dataset_id}` : ""}
              </SelectItem>
              <SelectItem value="project">
                Project {latest?.project_id}
              </SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => act("promote")}>
              Confirm promote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayloadCard({
  title,
  current,
  previous,
  histogram,
}: {
  title: string;
  current: DlpPayload | null;
  previous: DlpPayload | null;
  histogram: { info_type: string; findings: number; very_likely: number; likely: number; possible: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title} · this scan vs last</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <JsonBlock label="This scan" value={current} />
        <JsonBlock label="Last confirmed" value={previous} />
        <div className="sm:col-span-2 space-y-1">
          {histogram.length === 0 && (
            <p className="text-xs text-muted-foreground">No DLP findings on this column.</p>
          )}
          {histogram.map((h) => {
            const max = histogram[0]?.findings || 1;
            return (
              <div key={h.info_type} className="space-y-0.5">
                <div className="flex justify-between font-mono text-[11px]">
                  <span>{h.info_type}</span>
                  <span>
                    {h.findings} · VL {h.very_likely} L {h.likely} P {h.possible}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(100, (h.findings / max) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ValueCard({
  current,
  previous,
}: {
  current: ValuePayload | null;
  previous: ValuePayload | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Value sketch · this scan vs last</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <JsonBlock label="This scan" value={current} />
        <JsonBlock label="Last confirmed" value={previous} />
      </CardContent>
    </Card>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <pre
        className={cn(
          "max-h-56 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed",
          !value && "text-muted-foreground",
        )}
      >
        {value ? JSON.stringify(value, null, 2) : "No prior payload"}
      </pre>
    </div>
  );
}
