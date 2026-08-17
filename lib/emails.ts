/** Data access for emails, the review queue, user corrections and the kv store. */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { CorrectionExample, EmailEvent } from "./ai/classify";
import { EMAIL_EVENTS } from "./ai/classify";
import { getDb, type Db } from "./db";
import { applications, emails, kv, reviewQueue, type Email, type ReviewQueueItem } from "./db/schema";
import type { FetchedEmail } from "./gmail";
import { newId } from "./ids";

const nowIso = () => new Date().toISOString();

// ── kv ─────────────────────────────────────────────────────────────────────

export function getKv(key: string, db: Db = getDb()): string | null {
  return db.select({ value: kv.value }).from(kv).where(eq(kv.key, key)).get()?.value ?? null;
}

export function setKv(key: string, value: string, db: Db = getDb()): void {
  db.insert(kv)
    .values({ key, value, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: kv.key, set: { value, updatedAt: nowIso() } })
    .run();
}

// ── emails ─────────────────────────────────────────────────────────────────

export function knownEmailIds(ids: string[], db: Db = getDb()): Set<string> {
  if (ids.length === 0) return new Set();
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const row of db.select({ id: emails.id }).from(emails).where(inArray(emails.id, chunk)).all()) found.add(row.id);
  }
  return found;
}

export function insertEmail(e: FetchedEmail, db: Db = getDb()): Email {
  return db
    .insert(emails)
    .values({
      id: e.id,
      threadId: e.threadId,
      fromAddr: e.fromAddr,
      subject: e.subject,
      bodyText: e.bodyText,
      receivedAt: e.receivedAt,
      createdAt: nowIso(),
    })
    .onConflictDoNothing()
    .returning()
    .get() ?? db.select().from(emails).where(eq(emails.id, e.id)).get()!;
}

export function getEmail(id: string, db: Db = getDb()): Email | null {
  return db.select().from(emails).where(eq(emails.id, id)).get() ?? null;
}

export function setEmailDecision(
  id: string,
  patch: {
    applicationId: string | null;
    eventType: string | null;
    confidence: number | null;
    decidedBy: "auto" | "user" | "dismissed" | null;
  },
  db: Db = getDb(),
): void {
  db.update(emails).set(patch).where(eq(emails.id, id)).run();
}

export function listEmailsForApplication(applicationId: string, db: Db = getDb()): Email[] {
  return db.select().from(emails).where(eq(emails.applicationId, applicationId)).orderBy(desc(emails.receivedAt)).all();
}

// ── review queue ───────────────────────────────────────────────────────────

export function enqueueReview(
  emailId: string,
  proposed: { applicationId: string | null; event: string; confidence: number },
  db: Db = getDb(),
): ReviewQueueItem {
  return db
    .insert(reviewQueue)
    .values({
      id: newId("reviewItem"),
      emailId,
      proposedApplicationId: proposed.applicationId,
      proposedEvent: proposed.event,
      confidence: proposed.confidence,
      status: "pending",
      createdAt: nowIso(),
    })
    .returning()
    .get();
}

export type PendingReview = ReviewQueueItem & { email: Email; proposedApplication: { id: string; company: string; roleTitle: string } | null };

export function listPendingReviews(db: Db = getDb()): PendingReview[] {
  const items = db.select().from(reviewQueue).where(eq(reviewQueue.status, "pending")).orderBy(desc(reviewQueue.createdAt)).all();
  return items
    .map((item) => {
      const email = getEmail(item.emailId, db);
      if (!email) return null;
      const app = item.proposedApplicationId
        ? db
            .select({ id: applications.id, company: applications.company, roleTitle: applications.roleTitle })
            .from(applications)
            .where(eq(applications.id, item.proposedApplicationId))
            .get() ?? null
        : null;
      return { ...item, email, proposedApplication: app };
    })
    .filter((x): x is PendingReview => x !== null);
}

export function getReviewItem(id: string, db: Db = getDb()): ReviewQueueItem | null {
  return db.select().from(reviewQueue).where(eq(reviewQueue.id, id)).get() ?? null;
}

export function resolveReview(
  id: string,
  outcome:
    | { status: "accepted" }
    | { status: "corrected"; correctedApplicationId: string | null; correctedEvent: string }
    | { status: "dismissed" },
  db: Db = getDb(),
): void {
  db.update(reviewQueue)
    .set({
      status: outcome.status,
      resolvedAt: nowIso(),
      ...(outcome.status === "corrected"
        ? { correctedApplicationId: outcome.correctedApplicationId, correctedEvent: outcome.correctedEvent }
        : {}),
    })
    .where(eq(reviewQueue.id, id))
    .run();
}

/** The 10 most recent user decisions (corrected/dismissed) as few-shot examples for the classifier. */
export function recentCorrections(limit = 10, db: Db = getDb()): CorrectionExample[] {
  const rows = db
    .select()
    .from(reviewQueue)
    .where(and(inArray(reviewQueue.status, ["corrected", "dismissed"])))
    .orderBy(desc(reviewQueue.resolvedAt))
    .limit(limit)
    .all();
  const out: CorrectionExample[] = [];
  for (const r of rows) {
    const email = getEmail(r.emailId, db);
    if (!email) continue;
    const appId = r.status === "corrected" ? r.correctedApplicationId : null;
    const event = (r.status === "corrected" ? r.correctedEvent : "other") as EmailEvent;
    if (!EMAIL_EVENTS.includes(event)) continue;
    const app = appId
      ? db.select({ company: applications.company, roleTitle: applications.roleTitle }).from(applications).where(eq(applications.id, appId)).get()
      : null;
    out.push({
      fromAddr: email.fromAddr,
      subject: email.subject,
      snippet: email.bodyText.slice(0, 240).replace(/\s+/g, " "),
      applicationId: appId,
      applicationLabel: app ? `${app.company} — ${app.roleTitle}` : null,
      event,
    });
  }
  return out;
}
