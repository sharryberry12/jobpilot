/**
 * Sync run (SPEC §6.3 / §8): fetch new mail → prefilter → classify → apply or queue.
 * Runs in-process (boot, stale dashboard load, timer, Sync-now, CLI). Idempotent
 * on Gmail message id; single-flight so overlapping triggers share one run.
 */
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { classifyEmail, eventToStatus, type Classification } from "./ai/classify";
import { listActiveApplications, transitionApplication } from "./applications";
import { getDb } from "./db";
import { applications, statusEvents } from "./db/schema";
import { enqueueReview, getKv, insertEmail, knownEmailIds, recentCorrections, setEmailDecision, setKv } from "./emails";
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
      const ctx: ProcessContext = { active, corrections, changes: [] };
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
      if (source.name === "gmail" && listed.historyId) setKv(KV_LAST_HISTORY_ID, listed.historyId);
      if (ctx.changes.length > 0) await notifyAutoChanges(ctx.changes);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.errors.push(msg);
    console.error("[sync] run failed:", err);
  }

  summary.ghostedChanged = refreshGhostFlags();
  summary.finishedAt = new Date().toISOString();
  setKv(KV_LAST_SYNC_AT, summary.finishedAt);
  setKv(KV_LAST_SYNC_SUMMARY, JSON.stringify(summary));
  console.log(
    `[sync] ${trigger}/${summary.source}/${summary.mode}: fetched ${summary.fetched} / kept ${summary.kept} / auto-applied ${summary.autoApplied} / queued ${summary.queued} / linked ${summary.linked} / noise ${summary.noise}` +
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
