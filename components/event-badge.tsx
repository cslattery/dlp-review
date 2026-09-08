import { Badge } from "@/components/ui/badge";
import { eventLabel, eventTone, sourceLabel } from "@/lib/format";
import type { EventType, ProposalSource } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE: Record<ReturnType<typeof eventTone>, string> = {
  hot: "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300",
  cool: "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-300",
  neutral: "border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  muted: "border-transparent bg-muted text-muted-foreground",
  warn: "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300",
};

export function EventBadge({ type }: { type: EventType }) {
  return (
    <Badge variant="outline" className={cn("font-mono tracking-tight", TONE[eventTone(type)])}>
      {eventLabel(type)}
    </Badge>
  );
}

export function SourceBadge({ source }: { source: ProposalSource | null }) {
  if (!source) return <span className="text-muted-foreground">—</span>;
  const nameRule = source.startsWith("name_rule");
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono",
        source === "conflict" && TONE.hot,
        source === "dlp_map" && TONE.warn,
        nameRule && TONE.neutral,
        source === "mixed" && TONE.warn,
      )}
    >
      {sourceLabel(source)}
    </Badge>
  );
}
