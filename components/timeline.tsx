import { ArrowRight, Mail, MousePointerClick, Cog } from "lucide-react";
import type { StatusEvent } from "@/lib/db/schema";
import { STATUS_META, fmtDateTime, statusLabel } from "@/lib/format";
import { isStatus } from "@/lib/stateMachine";
import { cn } from "@/lib/utils";

const SOURCE_ICON = { manual: MousePointerClick, email: Mail, system: Cog } as const;

export function Timeline({ events }: { events: StatusEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events yet.</p>;
  }
  const ordered = [...events].reverse(); // newest first
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {ordered.map((ev) => {
        const to = isStatus(ev.toStatus) ? ev.toStatus : null;
        const from = ev.fromStatus && isStatus(ev.fromStatus) ? ev.fromStatus : null;
        const Icon = SOURCE_ICON[ev.source];
        return (
          <li key={ev.id} className="relative">
            <span
              className={cn(
                "absolute -left-[26px] top-1 size-3 rounded-full ring-4 ring-background",
                to ? STATUS_META[to].dot : "bg-muted-foreground",
              )}
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {from ? (
                <>
                  <span className="text-muted-foreground">{statusLabel(from)}</span>
                  <ArrowRight className="size-3 text-muted-foreground" />
                </>
              ) : null}
              <span className="font-medium">{to ? statusLabel(to) : ev.toStatus}</span>
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                <Icon className="size-3" />
                {ev.source}
              </span>
            </div>
            {ev.note && <p className="mt-0.5 text-sm text-muted-foreground">{ev.note}</p>}
            <time className="mt-0.5 block text-xs text-muted-foreground" dateTime={ev.createdAt}>
              {fmtDateTime(ev.createdAt)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
