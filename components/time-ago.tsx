"use client";

import { useSyncExternalStore } from "react";
import { fmtAgo, fmtDate } from "@/lib/format";

/**
 * Hydration-safe relative time. fmtAgo depends on Date.now(), so rendering it
 * during SSR breaks hydration whenever the HTML is adopted later than it was
 * produced (restored tab, bfcache, slow load): server says "1 minute ago",
 * client says "23 hours ago", React regenerates the tree.
 *
 * useSyncExternalStore renders the absolute date on the server and for the
 * hydration pass (deterministic on both sides), then swaps to the relative
 * form immediately after hydration and re-reads it every minute so a
 * long-lived tab stays truthful.
 */

/** Wake subscribers once a minute so the relative label stays current. */
function subscribeMinutely(onStoreChange: () => void): () => void {
  const timer = setInterval(onStoreChange, 60_000);
  return () => clearInterval(timer);
}

export function TimeAgo({ iso }: { iso: string }) {
  const label = useSyncExternalStore(
    subscribeMinutely,
    () => fmtAgo(iso),
    () => fmtDate(iso),
  );
  return <span>{label}</span>;
}
