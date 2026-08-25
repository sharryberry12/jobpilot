"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { dismissLeadAction, restoreLeadAction } from "@/app/actions/leads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Lead, LeadStatus } from "@/lib/db/schema";
import { TimeAgo } from "@/components/time-ago";
import { cn } from "@/lib/utils";

const TABS: { key: LeadStatus; label: string }[] = [
  { key: "new", label: "New" },
  { key: "dismissed", label: "Dismissed" },
  { key: "applied", label: "Applied" },
];

export function LeadsList({
  leads,
  show,
  counts,
}: {
  leads: Lead[];
  show: LeadStatus;
  counts: Record<LeadStatus, number>;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => `${l.title} ${l.company} ${l.location ?? ""}`.toLowerCase().includes(q));
  }, [leads, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-sm">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key === "new" ? "/leads" : `/leads?show=${t.key}`}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                show === t.key && "bg-muted text-foreground",
              )}
            >
              {t.label}
              <Badge variant={show === t.key ? "secondary" : "outline"} className="h-4 min-w-4 px-1 text-[10px]">
                {counts[t.key]}
              </Badge>
            </Link>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title, company, location…"
            className="pl-8"
            aria-label="Filter leads"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {leads.length === 0 ? `No ${show} leads.` : "Nothing matches that filter."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {filtered.map((lead) => (
            <LeadRow key={lead.id} lead={lead} />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        {filtered.length} of {leads.length} shown · newest sighting first
      </p>
    </div>
  );
}

function LeadRow({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error("Not applied", { description: r.error });
      toast.success(r.message ?? "Done");
      router.refresh();
    });

  const seen =
    lead.firstSeenAt === lead.lastSeenAt ? (
      <>
        seen <TimeAgo iso={lead.lastSeenAt} />
      </>
    ) : (
      <>
        first seen <TimeAgo iso={lead.firstSeenAt} /> · again <TimeAgo iso={lead.lastSeenAt} />
      </>
    );

  return (
    <li className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <a
          href={lead.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1 font-medium leading-snug hover:underline"
        >
          <span className="truncate">{lead.title}</span>
          <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
        </a>
        <div className="truncate text-sm text-muted-foreground">
          {lead.company}
          {lead.location ? ` · ${lead.location}` : ""}
          <span className="text-xs"> · {seen}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {lead.status === "new" && (
          <>
            <Button asChild size="sm">
              <Link href={`/applications/new?lead=${lead.id}`}>Start application</Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => dismissLeadAction(lead.id))}
              aria-label="Dismiss lead"
            >
              {pending ? <Loader2 className="animate-spin" /> : <X />}
              Dismiss
            </Button>
          </>
        )}
        {lead.status === "dismissed" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => restoreLeadAction(lead.id))}>
            {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Restore
          </Button>
        )}
        {lead.status === "applied" && lead.applicationId && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/applications/${lead.applicationId}`}>Open application</Link>
          </Button>
        )}
      </div>
    </li>
  );
}
