/** Presentation helpers shared by server and client components. */
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import type { Status } from "./stateMachine";

export const STATUS_META: Record<Status, { label: string; dot: string; badge: string }> = {
  applied: {
    label: "Applied",
    dot: "bg-slate-400",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
  screening: {
    label: "Screening",
    dot: "bg-sky-500",
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  },
  assessment: {
    label: "Assessment",
    dot: "bg-violet-500",
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  },
  interview: {
    label: "Interview",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  },
  offer: {
    label: "Offer",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  },
  accepted: {
    label: "Accepted",
    dot: "bg-green-600",
    badge: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
  },
  rejected: {
    label: "Rejected",
    dot: "bg-rose-500",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
  },
  withdrawn: {
    label: "Withdrawn",
    dot: "bg-zinc-400",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

export function statusLabel(status: Status): string {
  return STATUS_META[status].label;
}

const DASH = "\u2014";

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  try {
    return format(parseISO(iso), "d MMM yyyy, HH:mm");
  } catch {
    return iso;
  }
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return `${formatDistanceToNowStrict(parseISO(iso))} ago`;
  } catch {
    return "";
  }
}

/** ISO to yyyy-MM-dd for date inputs. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return format(parseISO(iso), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

export function fitTone(score: number | null | undefined): "good" | "mid" | "low" | "none" {
  if (score === null || score === undefined) return "none";
  if (score >= 75) return "good";
  if (score >= 50) return "mid";
  return "low";
}
