"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReviewAudit } from "@/lib/types";

export function AuditView({ initialFqn = "" }: { initialFqn?: string }) {
  const [fqn, setFqn] = useState(initialFqn);
  const [rows, setRows] = useState<ReviewAudit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = fqn ? `?fqn=${encodeURIComponent(fqn)}` : "";
    fetch(`/api/audit${p}`)
      .then((r) => r.json())
      .then((b) => setRows(b.rows ?? []))
      .catch((e) => setError(e.message));
  }, [fqn]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Review audit</h2>
        <p className="text-sm text-muted-foreground">
          Append-only steward actions for one column at a time — or the full log.
        </p>
      </div>
      <Input
        value={fqn}
        onChange={(e) => setFqn(e.target.value)}
        placeholder="Filter by column FQN"
        className="max-w-xl"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {rows && rows.length === 0 && (
        <div className="rounded-xl border border-dashed px-4 py-16 text-center">
          <p className="font-medium">No audit rows yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve, override, reject, untag, or promote a rule from the queue.
            Apply-tag is stubbed and only logs.
          </p>
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Column</TableHead>
                <TableHead>From → to</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.audit_id}>
                  <TableCell className="whitespace-nowrap font-mono text-[11px]">
                    {r.at.replace("T", " ").slice(0, 19)}
                  </TableCell>
                  <TableCell className="text-xs">{r.actor}</TableCell>
                  <TableCell className="font-mono text-xs">{r.action}</TableCell>
                  <TableCell className="max-w-[220px] truncate font-mono text-[11px]">
                    {r.column_fqn}
                  </TableCell>
                  <TableCell className="font-mono text-[11px]">
                    {r.previous_term_id ?? "—"} → {r.new_term_id ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground">
                    {r.notes}
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
