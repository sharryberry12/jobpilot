/**
 * Optional push notifications via ntfy.sh (SPEC P5): a push when sync
 * auto-applies status changes, and a daily digest. Disabled unless a topic is
 * configured. Failures are logged, never thrown — notifications are best-effort.
 */
import { and, gte, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { applications, reviewQueue, statusEvents } from "./db/schema";
import { getKv, setKv } from "./emails";
import { getSettings } from "./settings";
import { ACTIVE_STATUSES } from "./stateMachine";

export const KV_LAST_DIGEST_DATE = "last_digest_date";

function topicUrl(topic: string): string {
  const t = topic.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://ntfy.sh/${encodeURIComponent(t)}`;
}

export async function sendPush(title: string, body: string, opts: { tags?: string[]; priority?: 1 | 2 | 3 | 4 | 5 } = {}): Promise<boolean> {
  const url = topicUrl(getSettings().ntfyTopic);
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Title: title,
        ...(opts.tags?.length ? { Tags: opts.tags.join(",") } : {}),
        ...(opts.priority ? { Priority: String(opts.priority) } : {}),
      },
      body,
    });
    if (!res.ok) {
      console.warn(`[notify] ntfy responded ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[notify] push failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function notifyAutoChanges(changes: { company: string; roleTitle: string; from: string; to: string }[]): Promise<void> {
  if (changes.length === 0) return;
  const lines = changes.map((c) => `• ${c.company} — ${c.roleTitle}: ${c.from} → ${c.to}`);
  await sendPush(`JobPilot: ${changes.length} status change${changes.length > 1 ? "s" : ""}`, lines.join("\n"), { tags: ["email"] });
}

/** Compose the digest text from the last 24h. */
export function buildDigest(now = new Date()): string {
  const db = getDb();
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const active = db.select({ id: applications.id, ghosted: applications.ghosted }).from(applications).where(inArray(applications.status, [...ACTIVE_STATUSES])).all();
  const ghosted = active.filter((a) => a.ghosted).length;
  const pending = db.select({ id: reviewQueue.id }).from(reviewQueue).where(inArray(reviewQueue.status, ["pending"])).all().length;
  const recent = db
    .select({ toStatus: statusEvents.toStatus, applicationId: statusEvents.applicationId, source: statusEvents.source })
    .from(statusEvents)
    .where(and(gte(statusEvents.createdAt, since), inArray(statusEvents.source, ["email", "manual"])))
    .all();
  const names = new Map(db.select({ id: applications.id, company: applications.company }).from(applications).all().map((a) => [a.id, a.company]));
  const changes = recent.map((e) => `• ${names.get(e.applicationId) ?? e.applicationId} → ${e.toStatus} (${e.source})`);
  return [
    `${active.length} active application${active.length === 1 ? "" : "s"}${ghosted ? ` (${ghosted} ghosted)` : ""}`,
    `${pending} email${pending === 1 ? "" : "s"} waiting in the review queue`,
    changes.length ? `Last 24h:\n${changes.join("\n")}` : "No status changes in the last 24h.",
  ].join("\n");
}

/** Send at most one digest per local day, once the configured hour has passed. */
export async function maybeSendDailyDigest(now = new Date()): Promise<boolean> {
  const { digestHour, ntfyTopic } = getSettings();
  if (digestHour < 0 || !ntfyTopic.trim()) return false;
  if (now.getHours() < digestHour) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (getKv(KV_LAST_DIGEST_DATE) === today) return false;
  const sent = await sendPush("JobPilot daily digest", buildDigest(now), { tags: ["newspaper"] });
  if (sent) setKv(KV_LAST_DIGEST_DATE, today);
  return sent;
}
