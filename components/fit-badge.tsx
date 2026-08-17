"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fitTone } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FitBreakdown = {
  mustHave: { matched: number; total: number };
  niceToHave: { matched: number; total: number };
  gaps: string[];
};

const TONE_CLASS = {
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  mid: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  low: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  none: "bg-muted text-muted-foreground",
} as const;

/**
 * Fit score badge. SPEC §6.2: never show a bare number — the popover shows the
 * subscore breakdown and gap list once P2 computes them.
 */
export function FitBadge({
  score,
  breakdown,
  compact = false,
}: {
  score: number | null | undefined;
  breakdown?: FitBreakdown | null;
  compact?: boolean;
}) {
  const tone = fitTone(score);
  const label = score === null || score === undefined ? (compact ? "—" : "No fit score yet") : `${Math.round(score)}`;
  const chip = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full font-mono font-medium tabular-nums",
        compact ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-xs",
        TONE_CLASS[tone],
      )}
      title={compact && tone !== "none" ? `Fit ${label}/100` : undefined}
    >
      {compact ? label : tone === "none" ? label : `Fit ${label}`}
    </span>
  );

  if (!breakdown) return chip;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="cursor-help" onPointerDown={(e) => e.stopPropagation()}>
          {chip}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" align="end">
        <div className="font-medium">Fit breakdown</div>
        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Must-haves (70%)</dt>
            <dd className="font-mono">
              {breakdown.mustHave.matched}/{breakdown.mustHave.total}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Nice-to-haves (30%)</dt>
            <dd className="font-mono">
              {breakdown.niceToHave.matched}/{breakdown.niceToHave.total}
            </dd>
          </div>
        </dl>
        {breakdown.gaps.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium text-muted-foreground">Gaps</div>
            <ul className="mt-1 flex flex-wrap gap-1">
              {breakdown.gaps.map((g) => (
                <li key={g} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
