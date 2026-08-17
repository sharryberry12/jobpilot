"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { acceptReviewAction, correctReviewAction, dismissReviewAction } from "@/app/actions/review";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EMAIL_EVENTS } from "@/lib/ai/classify";
import type { PendingReview } from "@/lib/emails";
import { fmtDateTime } from "@/lib/format";

type AppOption = { id: string; company: string; roleTitle: string; status: string };

const NONE = "__none__";

export function ReviewQueue({ items, applications }: { items: PendingReview[]; applications: AppOption[] }) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <ReviewCard key={item.id} item={item} applications={applications} />
      ))}
    </div>
  );
}

function ReviewCard({ item, applications }: { item: PendingReview; applications: AppOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [correcting, setCorrecting] = useState(false);
  const [appId, setAppId] = useState<string>(item.proposedApplicationId ?? NONE);
  const [event, setEvent] = useState<string>(item.proposedEvent ?? "other");
  const [expanded, setExpanded] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error("Not applied", { description: r.error });
      toast.success(r.message ?? "Done");
      router.refresh();
    });

  const proposedLabel = item.proposedApplication
    ? `${item.proposedApplication.company} — ${item.proposedApplication.roleTitle}`
    : "No application";
  const confidence = item.confidence === null ? "—" : `${Math.round(item.confidence * 100)}%`;
  const body = item.email.bodyText;

  return (
    <div className="grid gap-4 rounded-xl border border-border p-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="min-w-0 space-y-2">
        <div className="text-xs text-muted-foreground">
          {fmtDateTime(item.email.receivedAt)} · <span className="font-mono">{item.email.fromAddr}</span>
        </div>
        <h3 className="font-medium leading-snug">{item.email.subject || "(no subject)"}</h3>
        <pre className={`whitespace-pre-wrap rounded-md bg-muted/40 p-3 font-sans text-sm ${expanded ? "" : "max-h-40 overflow-hidden"}`}>{body}</pre>
        {body.length > 500 && (
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Show less" : "Show full email"}
          </button>
        )}
      </div>

      <div className="space-y-3 rounded-lg bg-muted/30 p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Proposed</div>
        <div className="text-sm">
          <div className="font-medium">{proposedLabel}</div>
          <div className="text-muted-foreground">
            event <span className="font-mono">{item.proposedEvent ?? "?"}</span> · confidence {confidence}
          </div>
        </div>

        {correcting ? (
          <div className="space-y-2">
            <Select value={appId} onValueChange={setAppId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Application" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not about an application</SelectItem>
                {applications.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.company} — {a.roleTitle} ({a.status})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={event} onValueChange={setEvent}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Event" /></SelectTrigger>
              <SelectContent>
                {EMAIL_EVENTS.map((e) => (<SelectItem key={e} value={e}>{e}</SelectItem>))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={() => run(() => correctReviewAction(item.id, appId === NONE ? null : appId, event))}>
                {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}
                Save correction
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCorrecting(false)} disabled={pending}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending || !item.proposedEvent} onClick={() => run(() => acceptReviewAction(item.id))}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              Accept
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setCorrecting(true)}>
              <Pencil data-icon="inline-start" />
              Correct
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => dismissReviewAction(item.id))}>
              <X data-icon="inline-start" />
              Dismiss
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
