/**
 * Application status state machine (SPEC §5).
 *
 * Pure: no I/O, no DB. Every automated status change (email/system) MUST go
 * through `canTransition`; anything it refuses goes to the review queue.
 */

export const STATUSES = [
  "applied",
  "screening",
  "assessment",
  "interview",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
] as const;

export type Status = (typeof STATUSES)[number];
export type Source = "manual" | "email" | "system";

/** States an application can still progress from. */
export const ACTIVE_STATUSES: readonly Status[] = [
  "applied",
  "screening",
  "assessment",
  "interview",
  "offer",
];

/** Final states — nothing may leave these. */
export const TERMINAL_STATUSES: readonly Status[] = ["accepted", "rejected", "withdrawn"];

/**
 * The pre-offer pipeline, in order. Manual backward moves are permitted only
 * within this set (undoing a mis-drag). `offer` is a milestone: one-way.
 */
export const PIPELINE_STATUSES: readonly Status[] = [
  "applied",
  "screening",
  "assessment",
  "interview",
];

/** Forward edges — legal for every source (manual, email, system). */
export const FORWARD_EDGES: ReadonlyArray<readonly [Status, Status]> = [
  ["applied", "screening"],
  ["applied", "assessment"],
  ["applied", "interview"],
  ["screening", "assessment"],
  ["screening", "interview"],
  ["assessment", "interview"],
  ["interview", "interview"], // another interview round
  ["interview", "offer"],
  ["offer", "accepted"],
];

export type TransitionResult = { ok: true } | { ok: false; reason: string };

const label = (s: Status) => s.charAt(0).toUpperCase() + s.slice(1);

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export function isActive(status: Status): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function isTerminal(status: Status): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isForwardEdge(from: Status, to: Status): boolean {
  return FORWARD_EDGES.some(([f, t]) => f === from && t === to);
}

function isBackwardPipelineMove(from: Status, to: Status): boolean {
  const fromIdx = PIPELINE_STATUSES.indexOf(from);
  const toIdx = PIPELINE_STATUSES.indexOf(to);
  return fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx;
}

const refuse = (reason: string): TransitionResult => ({ ok: false, reason });

/**
 * Decide whether `from → to` is legal for the given `source`.
 *
 * Rules (SPEC §5):
 *  - Forward edges: any source.
 *  - Any active state → rejected: any source.
 *  - Any active state → withdrawn: manual only.
 *  - Backward moves within the pre-offer pipeline: manual only.
 *  - Terminal states are final; offer never moves backward.
 */
export function canTransition(from: Status, to: Status, source: Source): TransitionResult {
  if (isTerminal(from)) {
    return refuse(`${label(from)} is a final state — nothing can move out of it.`);
  }

  if (from === to && to !== "interview") {
    return refuse(`Already in ${label(from)}.`);
  }

  if (isForwardEdge(from, to)) {
    return { ok: true };
  }

  if (to === "rejected") {
    return { ok: true }; // any active state, any source
  }

  if (to === "withdrawn") {
    return source === "manual"
      ? { ok: true }
      : refuse("Withdrawing an application is a manual-only action.");
  }

  if (isBackwardPipelineMove(from, to)) {
    return source === "manual"
      ? { ok: true }
      : refuse(`Moving backward (${label(from)} → ${label(to)}) is manual-only.`);
  }

  if (from === "offer" && PIPELINE_STATUSES.includes(to)) {
    return refuse(`An offer can't go back to ${label(to)} — it can only be accepted, rejected or withdrawn.`);
  }

  return refuse(`${label(from)} → ${label(to)} skips required steps and isn't a valid move.`);
}

/** Convenience: which statuses can `from` legally reach for this source. */
export function allowedTargets(from: Status, source: Source): Status[] {
  return STATUSES.filter((to) => canTransition(from, to, source).ok);
}
