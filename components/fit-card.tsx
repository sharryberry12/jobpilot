"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { extractRequirementsAction, refreshFitAction } from "@/app/actions/resume";
import { FitBadge } from "@/components/fit-badge";
import { Button } from "@/components/ui/button";
import type { FitResult } from "@/lib/fit";
import type { Requirements } from "@/lib/profile";

export function FitCard({
  applicationId,
  fit,
  requirements,
  hasMaster,
  hasApiKey,
}: {
  applicationId: string;
  fit: FitResult | null;
  requirements: Requirements | null;
  hasMaster: boolean;
  hasApiKey: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function extract() {
    startTransition(async () => {
      const r = await extractRequirementsAction(applicationId);
      if (!r.ok) return void toast.error("Extraction failed", { description: r.error });
      toast.success(r.fitScore === null ? "Requirements extracted" : `Requirements extracted — fit ${r.fitScore}/100`);
      router.refresh();
    });
  }
  function recompute() {
    startTransition(async () => {
      const r = await refreshFitAction(applicationId);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.fitScore === null ? "Nothing to score yet" : `Fit ${r.fitScore}/100`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FitBadge score={fit?.score ?? null} breakdown={fit ? { mustHave: fit.mustHave, niceToHave: fit.niceToHave, gaps: fit.gaps } : null} />
        {requirements && (
          <span className="text-xs text-muted-foreground">
            {requirements.role_family} · {requirements.seniority}
          </span>
        )}
      </div>

      {fit && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Must-haves (70%)</dt>
          <dd className="font-mono">{fit.mustHave.matched}/{fit.mustHave.total}</dd>
          <dt className="text-muted-foreground">Nice-to-haves (30%)</dt>
          <dd className="font-mono">{fit.niceToHave.matched}/{fit.niceToHave.total}</dd>
        </dl>
      )}

      {requirements && (
        <div className="space-y-2">
          <Chips label="Matched" items={[...(fit?.matchedMust ?? []), ...(fit?.matchedNice ?? [])]} tone="good" />
          <Chips label="Gaps (must-haves first)" items={fit?.gaps ?? []} tone="bad" emphasizeFirst={fit?.mustHave.total ? fit.mustHave.total - fit.mustHave.matched : 0} />
        </div>
      )}

      {!requirements && (
        <p className="text-sm text-muted-foreground">
          {!hasMaster
            ? "Upload your master resume to enable requirement extraction and fit scoring."
            : !hasApiKey
              ? "Set ANTHROPIC_API_KEY to extract requirements."
              : "Requirements have not been extracted for this job yet."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={extract} disabled={pending || !hasApiKey}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
          {requirements ? "Re-extract requirements" : "Extract requirements"}
        </Button>
        {requirements && hasMaster && (
          <Button size="sm" variant="ghost" onClick={recompute} disabled={pending}>
            <RefreshCw data-icon="inline-start" />
            Recompute fit
          </Button>
        )}
      </div>
    </div>
  );
}

function Chips({ label, items, tone, emphasizeFirst = 0 }: { label: string; items: string[]; tone: "good" | "bad"; emphasizeFirst?: number }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <ul className="mt-1 flex flex-wrap gap-1">
        {items.map((it, i) => (
          <li
            key={it}
            className={
              tone === "good"
                ? "rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[11px] text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                : i < emphasizeFirst
                  ? "rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                  : "rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
            }
          >
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
