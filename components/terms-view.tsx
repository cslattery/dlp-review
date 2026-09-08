"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ColumnNameRule, InfoTypeMap, NameRuleNegative, Term } from "@/lib/types";

export function TermsView() {
  const [data, setData] = useState<{
    terms: Term[];
    rules: ColumnNameRule[];
    negatives: NameRuleNegative[];
    info_type_map: InfoTypeMap[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/terms")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!data) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-16 text-center text-sm text-muted-foreground">
        Loading term catalog…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Term catalog</h2>
        <p className="text-sm text-muted-foreground">
          Read-only. Sensitivity rank is higher for more sensitive terms. Name
          rules suggest; they never apply tags.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Term</TableHead>
              <TableHead>Family</TableHead>
              <TableHead>Rank</TableHead>
              <TableHead>Mask</TableHead>
              <TableHead>DLP types</TableHead>
              <TableHead>When to use</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.terms.map((t) => (
              <TableRow key={t.term_id}>
                <TableCell>
                  <div className="font-medium">{t.display_name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {t.term_id}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{t.term_family}</Badge>
                </TableCell>
                <TableCell className="font-mono">{t.sensitivity_rank}</TableCell>
                <TableCell className="font-mono text-xs">{t.masking_policy}</TableCell>
                <TableCell className="font-mono text-[11px]">
                  {t.dlp_info_types.join(", ") || "—"}
                </TableCell>
                <TableCell className="max-w-xs text-xs text-muted-foreground">
                  {t.when_to_use}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">info_type_map</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {data.info_type_map.map((m) => (
            <Badge key={m.info_type} variant="secondary" className="font-mono">
              {m.info_type} → {m.term_id}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-2 text-lg font-semibold">Name rules</h3>
        {data.rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No name rules.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Conf</TableHead>
                  <TableHead>Auto apply</TableHead>
                  <TableHead>From</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rules.map((r) => (
                  <TableRow key={r.rule_id}>
                    <TableCell className="font-mono text-[11px]">{r.rule_id}</TableCell>
                    <TableCell className="font-mono text-[11px]">
                      {r.match_type} {r.pattern}
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">{r.term_id}</TableCell>
                    <TableCell className="font-mono text-[11px]">
                      {r.scope_type}:{r.scope_value}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.confidence}</TableCell>
                    <TableCell>
                      {r.allow_auto_apply ? (
                        <Badge variant="destructive">true</Badge>
                      ) : (
                        <span className="text-muted-foreground">false</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">
                      {r.created_from_fqn ?? r.source}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-lg font-semibold">Negatives</h3>
        {data.negatives.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground">
            No steward negatives yet. Reject with “never suggest” to add one.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.negatives.map((n) => (
              <li key={n.negative_id} className="rounded-lg border px-3 py-2 text-sm">
                <span className="font-mono text-xs">{n.pattern}</span> must not
                map to <span className="font-mono text-xs">{n.rejected_term_id}</span>{" "}
                in {n.scope_type}:{n.scope_value}
                <p className="text-xs text-muted-foreground">{n.notes}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
