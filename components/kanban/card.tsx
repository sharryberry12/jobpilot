"use client";

import Link from "next/link";
import { Ghost, MapPin } from "lucide-react";
import type { ApplicationWithStatus } from "@/lib/applications";
import { fmtAgo, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FitBadge } from "@/components/fit-badge";

export function ApplicationCard({
  app,
  dragging = false,
  overlay = false,
}: {
  app: ApplicationWithStatus;
  dragging?: boolean;
  overlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "group rounded-lg border border-border bg-card p-3 text-card-foreground shadow-xs transition-shadow",
        dragging && "opacity-40",
        overlay && "rotate-1 shadow-lg ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/applications/${app.id}`}
            className="block truncate text-sm font-medium leading-tight hover:underline"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {app.roleTitle}
          </Link>
          <div className="truncate text-xs text-muted-foreground">{app.company}</div>
        </div>
        <FitBadge score={app.fitScore} compact />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span title={fmtDate(app.appliedAt)}>Applied {fmtAgo(app.appliedAt)}</span>
        {app.location && (
          <span className="flex items-center gap-0.5">
            <MapPin className="size-3" />
            {app.location}
          </span>
        )}
        {app.ghosted && (
          <span className="flex items-center gap-0.5 rounded bg-muted px-1 text-foreground/70">
            <Ghost className="size-3" />
            Ghosted
          </span>
        )}
      </div>
    </div>
  );
}
