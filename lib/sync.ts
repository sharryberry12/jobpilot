/**
 * Sync run (SPEC §6.3 / §8): fetch new mail → prefilter → classify → apply or queue.
 * Runs in-process (boot, stale dashboard load, timer, Sync-now, CLI). Idempotent
 * on Gmail message id; single-flight so overlapping triggers share one run.
 */
import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { classifyEmail, eventToStatus, type Classification } from "./ai/classify";
import { listActiveApplications, transitionApplication } from "./applications";
import { getDb } from "./db";
import { applications, reviewQueue, statusEvents } from "./db/schema";
import { enqueueReview, getEmail, getKv, insertEmail, knownEmailIds, recentCorrections, setEmailDecision, setKv } from "./emails";
import { extractLeadsFromEmail } from "./leads";
import { fetchMessage, getGmailClient, hasGmailToken, listNewMessageIds, type FetchedEmail, type ListResult } from "./gmail";
import { prefilter } from "./prefilter";
import { PIPELINE_STATUSES, canTransition } from "./stateMachine";
import { getSettings } from "./settings";
import { notifyAutoChanges } from "./notify";

export type SyncTrigger = "boot" | "timer" | "stale-load" | "manual" | "cli";

export type EmailSource = {
  name: "gmail" | "fixtures";
  list(startHistoryId: string | null): Promise<ListResult>;
  fetch(id: string): Promise<FetchedEmail | null>;
};

export type SyncSummary = {
  trigger: SyncTrigger;
  source: EmailSource["name"];
  mode: ListResult["mode"] | "skipped";
  startedAt: string;
  finishedAt: string;
  fetched: number;
  kept: number;
  autoApplied: number;
  queued: number;
  linked: number;
  noise: number;
  /** New job leads harvested from job-alert digests this run. */
  leads: number;
  ghostedChanged: number;
  skippedReason?: string;
  errors: string[];
};

export const KV_LAST_HISTORY_ID = "last_history_id";
export const KV_LAST_SYNC_AT = "last_sync_at";
export const KV_LAST_SYNC_SUMMARY = "last_sync_summary";

let inFlight: Promise<SyncSummary> | null = null;

export function isSyncRunning(): boolean {
  return inFlight !== null;
}

export function gmailSource(): EmailSource {
  const gmail = getGmailClient();
  return {
    name: "gmail",
    list: (start) => listNewMessageIds(gmail, start),
    fetch: (id) => fetchMessage(gmail, id),
  };
}

export async function runSync(opts: { trigger: SyncTrigger; source?: EmailSource }): Promise<SyncSummary> {
  if (inFlight) return inFlight;
  inFlight = doRun(opts).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRun({ trigger, source }: { trigger: SyncTrigger; source?: EmailSource }): Promise<SyncSummary> {
  const startedAt = new Date().toISOString();
  const summary: SyncSummary = {
    trigger,
    source: source?.name ?? "gmail",
    mode: "skipped",
    startedAt,
    finishedAt: startedAt,
    fetched: 0,
    kept: 0,
    autoApplied: 0,
    queued: 0,
    linked: 0,
    noise: 0,
    leads: 0,
    ghostedChanged: 0,
    errors: [],
  };

  try {
    if (!source) {
      if (!hasGmailToken()) {
        summary.skippedReason = "Gmail is not connected (run npm run gmail:auth)";
      } else {
        source = gmailSource();
      }
    }

    if (source) {
      const startHistoryId = source.name === "gmail" ? getKv(KV_LAST_HISTORY_ID) : null;
      const listed = await source.list(startHistoryId);
      summary.mode = listed.mode;
      const known = knownEmailIds(listed.ids);
      const fresh = listed.ids.filter((id) => !known.has(id));
      summary.fetched = fresh.length;

      const active = listActiveApplications();
      const corrections = recentCorrections(10);
      const ctx: ProcessContext = { active, corrections, changes: [], leadsFound: 0 };
      for (const id of fresh) {
        try {
          const email = await source.fetch(id);
          if (!email) continue;
          const outcome = await processEmail(email, ctx);
          if (outcome !== "dropped") summary.kept += 1;
          if (outcome === "auto") summary.autoApplied += 1;
          else if (outcome === "queued") summary.queued += 1;
          else if (outcome === "linked") summary.linked += 1;
          else if (outcome === "noise") summary.noise += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          summary.errors.push(`${id}: ${msg}`);
          console.error(`[sync] failed on message ${id}:`, err);
        }
      }
      summary.leads = ctx.leadsFound;
      if (source.name === "gmail" && listed.historyId) setKv(KV_LAST_HISTORY_ID, listed.historyId);
      if (ctx.changes.length > 0) await notifyAutoChanges(ctx.changes);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.errors.push(msg);
    console.error("[sync] run failed:", err);
  }

  // Bookkeeping is best-effort too: runSync must always resolve with a summary
  // (it is fired-and-forgotten from page loads; a rejection would be unhandled).
  try {
    summary.ghostedChanged = refreshGhostFlags();
  } catch (err) {
    summary.errors.push(`ghost flags: ${err instanceof Error ? err.message : String(err)}`);
    console.error("[sync] ghost-flag refresh failed:", err);
  }
  summary.finishedAt = new Date().toISOString();
  try {
    setKv(KV_LAST_SYNC_AT, summary.finishedAt);
    setKv(KV_LAST_SYNC_SUMMARY, JSON.stringify(summary));
  } catch (err) {
    summary.errors.push(`kv: ${err instanceof Error ? err.message : String(err)}`);
    console.error("[sync] could not record sync bookkeeping:", err);
  }
  console.log(
    `[sync] ${trigger}/${summary.source}/${summary.mode}: fetched ${summary.fetched} / kept ${summary.kept} / auto-applied ${summary.autoApplied} / queued ${summary.queued} / linked ${summary.linked} / noise ${summary.noise}` +
      (summary.leads ? ` / new leads ${summary.leads}` : "") +
      (summary.ghostedChanged ? ` / ghost flags changed ${summary.ghostedChanged}` : "") +
      (summary.skippedReason ? ` (${summary.skippedReason})` : "") +
      (summary.errors.length ? ` / errors ${summary.errors.length}` : ""),
  );
  return summary;
}

export type ProcessOutcome = "dropped" | "auto" | "queued" | "linked" | "noise";

type ProcessContext = {
  active: ReturnType<typeof listActiveApplications>;
  corrections: ReturnType<typeof recentCorrections>;
  /** Auto-applied changes this run, for the optional push notification. */
  changes: { company: string; roleTitle: string; from: string; to: string }[];
  /** New leads harvested this run (job-alert digests). */
  leadsFound: number;
};

/**
 * prefilter → store → classify → apply-or-queue for one email.
 * Anything the state machine refuses, or the classifier is unsure about, goes
 * to the review queue (hard rule 2). Emails that fail the prefilter are dropped
 * and never stored.
 */
export async function processEmail(email: FetchedEmail, ctx: ProcessContext): Promise<ProcessOutcome> {
  const pf = prefilter(email, ctx.active.map((a) => ({ id: a.id, company: a.company, companyDomains: a.companyDomains })), {
    extraAtsDomains: getSettings().extraAtsDomains,
  });
  if (!pf.keep) return "dropped";

  insertEmail(email);
  harvestLeads(email, ctx);

  const result = await classifyEmail(
    email,
    ctx.active.map((a) => ({ id: a.id, company: a.company, roleTitle: a.roleTitle, status: a.status, appliedAt: a.appliedAt })),
    ctx.corrections,
  );
  if (!result.ok) {
    console.warn(`[sync] classifier failed for ${email.id}: ${result.error} — queued for review`);
    enqueueReview(email.id, { applicationId: null, event: "other", confidence: 0 });
    return "queued";
  }
  return applyClassification(email.id, result.data, ctx);
}

export function applyClassification(emailId: string, c: Classification, ctx: ProcessContext): ProcessOutcome {
  const threshold = getSettings().autoApplyConfidence;
  const confident = c.confidence >= threshold;
  const app = c.application_id ? ctx.active.find((a) => a.id === c.application_id) ?? null : null;

  // Confidently irrelevant (job alerts, newsletters): store, mark, do not bother the user.
  if (!app && c.event === "other" && confident) {
    setEmailDecision(emailId, { applicationId: null, eventType: "other", confidence: c.confidence, decidedBy: "auto" });
    return "noise";
  }

  if (app && confident) {
    const implied = eventToStatus(c.event);
    const consistent = implied === null || (implied === app.status && implied !== "interview");
    if (consistent) {
      setEmailDecision(emailId, { applicationId: app.id, eventType: c.event, confidence: c.confidence, decidedBy: "auto" });
      return "linked";
    }
    if (canTransition(app.status, implied, "email").ok) {
      const moved = transitionApplication(app.id, implied, "email", { emailId, note: `Email: ${c.evidence.slice(0, 120)}` });
      if (moved.ok) {
        setEmailDecision(emailId, { applicationId: app.id, eventType: c.event, confidence: c.confidence, decidedBy: "auto" });
        ctx.changes.push({ company: app.company, roleTitle: app.roleTitle, from: app.status, to: implied });
        // Keep the in-memory view of active apps current for later emails in this run.
        const idx = ctx.active.findIndex((a) => a.id === app.id);
        if (idx >= 0) ctx.active[idx] = moved.application;
        return "auto";
      }
    }
  }

  setEmailDecision(emailId, { applicationId: null, eventType: c.event, confidence: c.confidence, decidedBy: null });
  enqueueReview(emailId, { applicationId: app?.id ?? null, event: c.event, confidence: c.confidence });
  return "queued";
}

/** Job-alert digests carry candidate roles; parsing is deterministic and must never break a sync. */
function harvestLeads(email: FetchedEmail, ctx: ProcessContext): void {
  try {
    ctx.leadsFound += extractLeadsFromEmail(email).inserted;
  } catch (err) {
    console.warn(`[sync] lead extraction failed for ${email.id}:`, err instanceof Error ? err.message : err);
  }
}

export type ReclassifySummary = {
  scanned: number;
  reclassified: number;
  auto: number;
  linked: number;
  noise: number;
  queued: number;
  failed: number;
  errors: string[];
};

/**
 * Re-run the classifier over review-queue rows that exist only because the
 * classifier itself failed (missing key, rate limit, …): pending, no proposal,
 * confidence 0 — the fallback written by processEmail. Each stale row is replaced
 * by whatever the fresh classification decides (auto-apply, link, noise, or a real
 * low-confidence queue item). A stale row is removed only after its replacement
 * decision has been written, and every item runs in its own try/catch, so a
 * failure (classifier error, SQLITE_BUSY, …) leaves that row for the next run
 * and never aborts the batch. Safe alongside a timer sync: a sync only touches
 * emails it has not seen before, so the two never act on the same row.
 */
export async function reclassifyFallbacks(
  opts: { limit?: number; onItem?: (line: string) => void } = {},
): Promise<ReclassifySummary> {
  const summary: ReclassifySummary = { scanned: 0, reclassified: 0, auto: 0, linked: 0, noise: 0, queued: 0, failed: 0, errors: [] };
  const db = getDb();
  const stale = db
    .select()
    .from(reviewQueue)
    .where(
      and(
        eq(reviewQueue.status, "pending"),
        eq(reviewQueue.confidence, 0),
        eq(reviewQueue.proposedEvent, "other"),
        isNull(reviewQueue.proposedApplicationId),
      ),
    )
    .orderBy(reviewQueue.createdAt)
    .all();
  const items = opts.limit ? stale.slice(0, opts.limit) : stale;
  const ctx: ProcessContext = { active: listActiveApplications(), corrections: recentCorrections(10), changes: [], leadsFound: 0 };

  for (const item of items) {
    summary.scanned += 1;
    try {
      const email = getEmail(item.emailId);
      if (!email) {
        // Orphan (email row gone): the queue item can never be resolved — drop it.
        db.delete(reviewQueue).where(eq(reviewQueue.id, item.id)).run();
        continue;
      }
      const result = await classifyEmail(
        { fromAddr: email.fromAddr, subject: email.subject, receivedAt: email.receivedAt, bodyText: email.bodyText },
        ctx.active.map((a) => ({ id: a.id, company: a.company, roleTitle: a.roleTitle, status: a.status, appliedAt: a.appliedAt })),
        ctx.corrections,
      );
      if (!result.ok) {
        summary.failed += 1;
        summary.errors.push(`${email.id}: ${result.code} ${result.error}`);
        opts.onItem?.(`✗ ${email.subject.slice(0, 60)} — ${result.code}`);
        continue;
      }
      // Write the replacement decision first; only then remove the fallback row.
      // If applyClassification throws, the stale row survives and is retried next run.
      const outcome = applyClassification(email.id, result.data, ctx);
      db.delete(reviewQueue).where(eq(reviewQueue.id, item.id)).run();
      summary.reclassified += 1;
      if (outcome === "auto") summary.auto += 1;
      else if (outcome === "linked") summary.linked += 1;
      else if (outcome === "noise") summary.noise += 1;
      else if (outcome === "queued") summary.queued += 1;
      opts.onItem?.(`${outcome.padEnd(6)} ${Math.round(result.data.confidence * 100)}% ${result.data.event.padEnd(22)} ${email.subject.slice(0, 60)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.failed += 1;
      summary.errors.push(`${item.emailId}: ${msg}`);
      console.error(`[reclassify] failed on review item ${item.id}:`, err);
    }
  }
  if (ctx.changes.length > 0) await notifyAutoChanges(ctx.changes);
  return summary;
}

/**
 * Ghosted is derived, not a state (SPEC §5): active pipeline applications whose
 * latest status_event is older than GHOST_DAYS. Any new event clears it.
 * Returns how many rows changed.
 */
export function refreshGhostFlags(): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - getSettings().ghostDays * 86_400_000).toISOString();
  const rows = db
    .select({ id: applications.id, ghosted: applications.ghosted, status: applications.status })
    .from(applications)
    .where(inArray(applications.status, [...PIPELINE_STATUSES]))
    .all();
  let changed = 0;
  for (const row of rows) {
    const latest = db
      .select({ createdAt: statusEvents.createdAt })
      .from(statusEvents)
      .where(eq(statusEvents.applicationId, row.id))
      .orderBy(desc(statusEvents.createdAt))
      .get();
    const shouldGhost = latest ? latest.createdAt < cutoff : false;
    if (shouldGhost !== row.ghosted) {
      db.update(applications).set({ ghosted: shouldGhost }).where(eq(applications.id, row.id)).run();
      changed += 1;
    }
  }
  // Non-pipeline rows must never carry the flag.
  const cleared = db
    .update(applications)
    .set({ ghosted: false })
    .where(and(eq(applications.ghosted, true), notInArray(applications.status, [...PIPELINE_STATUSES])))
    .run();
  return changed + cleared.changes;
}
