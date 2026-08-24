/**
 * Job leads: candidate roles harvested from LinkedIn job-alert / recommendation
 * emails ("Title / Company / Location / … / View job: …/jobs/view/<id>/").
 *
 * - Deterministic regex parse — no model call, no spend, fully testable.
 * - Deduped on (source, external_id); first/last seen are min/max so re-running
 *   over the same email (backfill, sync retry) is idempotent.
 * - A lead is not an application. "Start application" prefills /applications/new;
 *   the tracker still begins at `applied` (SPEC §5).
 */
import { and, eq, like, sql } from "drizzle-orm";
import { getDb, type Db } from "./db";
import { emails, leads, type Lead, type LeadStatus } from "./db/schema";
import { newId } from "./ids";

export type ParsedLead = {
  externalId: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
};

export type LeadEmail = { id: string; fromAddr: string; bodyText: string; receivedAt: string };
export type ExtractSummary = { found: number; inserted: number };
export type BackfillSummary = ExtractSummary & { emailsScanned: number };

/** LinkedIn job-view links, with or without the /comm/ email-tracking prefix. */
const JOB_VIEW_RE = /https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i;
const VIEW_LINE_RE = /^\s*view job:/i;
const BLOCK_SEP_RE = /^\s*-{10,}\s*$/;
const URL_LINE_RE = /^https?:\/\//i;
/** Lines LinkedIn wedges between the location and the "View job" link. Conservative on purpose. */
const PERIOD = "(?:yr|hr|mo|year|hour|month)";
/** One salary figure: "A$120,000.00/yr", "$150K", "€60,000", "120,000/yr". */
const MONEY = `(?:[A-Z]{1,3})?[$€£]?\\s?\\d[\\d,.]*\\s*[kK]?(?:\\s*\\/\\s*${PERIOD})?`;
const EXTRA_LINE_PATTERNS = [
  "this company is actively hiring",
  "actively (?:hiring|recruiting)",
  "apply with resume.*",
  "be an early applicant",
  "easy apply",
  "promoted",
  "\\d+\\s+(?:connections?|applicants?|mutual connections?)",
  "\\d+\\s+(?:\\w+\\s+)?alum(?:ni|nus)?\\b.*",
  "(?:re)?posted\\b.*",
  // A line that is *only* a salary or salary range (a title may legitimately mention pay).
  `${MONEY}(?:\\s*[-–]\\s*${MONEY})?`,
];
const EXTRA_LINE_RE = new RegExp(`^(?:${EXTRA_LINE_PATTERNS.map((p) => `(?:${p})`).join("|")})$`, "i");
const HTML_TAG_RE = /<[^>]+>/g;

/** SQL prefilter so backfill only parses digests (LIKE is case-insensitive for ASCII in SQLite). */
const JOB_VIEW_LIKE = "%linkedin.com/%jobs/view/%";

export function canonicalJobUrl(externalId: string): string {
  return `https://www.linkedin.com/jobs/view/${externalId}/`;
}

/**
 * Parse every job card in a LinkedIn digest body. Cards end in a "View job:" line;
 * the three meaningful lines before it are title, company, location. Section
 * headers and marketing extras are filtered out; the same job id is reported once.
 */
export function parseLinkedInJobs(bodyText: string): ParsedLead[] {
  if (!bodyText || !JOB_VIEW_RE.test(bodyText)) return [];
  const out: ParsedLead[] = [];
  const seen = new Set<string>();

  for (const block of splitBlocks(bodyText)) {
    let cursor = 0;
    for (let i = 0; i < block.length; i += 1) {
      const line = block[i];
      if (!VIEW_LINE_RE.test(line)) continue;
      const match = line.match(JOB_VIEW_RE);
      const cardLines = block.slice(cursor, i);
      cursor = i + 1;
      if (!match) continue;
      const externalId = match[1];
      if (seen.has(externalId)) continue;
      const card = cardFromLines(cardLines);
      if (!card) continue;
      seen.add(externalId);
      out.push({ externalId, ...card, url: canonicalJobUrl(externalId) });
    }
  }
  return out;
}

function splitBlocks(bodyText: string): string[][] {
  const blocks: string[][] = [[]];
  for (const raw of bodyText.split(/\r?\n/)) {
    if (BLOCK_SEP_RE.test(raw)) blocks.push([]);
    else blocks[blocks.length - 1].push(raw);
  }
  return blocks;
}

function cardFromLines(lines: string[]): Pick<ParsedLead, "title" | "company" | "location"> | null {
  const meaningful = lines
    .map((l) => l.replace(HTML_TAG_RE, "").trim())
    .filter((l) => l.length > 0 && !URL_LINE_RE.test(l) && !EXTRA_LINE_RE.test(l));
  if (meaningful.length < 2) return null;
  const tail = meaningful.slice(-3);
  if (tail.length === 3) return { title: tail[0], company: tail[1], location: tail[2] };
  return { title: tail[0], company: tail[1], location: null };
}

/**
 * Parse one stored/fetched email and upsert its job cards. Safe to call for any
 * email — non-digests return { found: 0, inserted: 0 } without touching the DB.
 */
export function extractLeadsFromEmail(email: LeadEmail, db: Db = getDb()): ExtractSummary {
  const parsed = parseLinkedInJobs(email.bodyText);
  if (parsed.length === 0) return { found: 0, inserted: 0 };
  return { found: parsed.length, inserted: upsertLeads(parsed, { emailId: email.id, seenAt: email.receivedAt }, db) };
}

/**
 * Insert new leads; for known ones widen first/last seen and refresh the parsed
 * display fields (so a parser fix heals old rows on the next run). Never touches
 * status / application_id — those are user-owned.
 */
export function upsertLeads(parsed: ParsedLead[], ctx: { emailId: string; seenAt: string }, db: Db = getDb()): number {
  const now = new Date().toISOString();
  return db.transaction((tx) => {
    let inserted = 0;
    for (const p of parsed) {
      const existing = tx
        .select({
          id: leads.id,
          firstSeenAt: leads.firstSeenAt,
          lastSeenAt: leads.lastSeenAt,
          title: leads.title,
          company: leads.company,
          location: leads.location,
          url: leads.url,
        })
        .from(leads)
        .where(and(eq(leads.source, "linkedin"), eq(leads.externalId, p.externalId)))
        .get();
      if (existing) {
        const next = {
          firstSeenAt: ctx.seenAt < existing.firstSeenAt ? ctx.seenAt : existing.firstSeenAt,
          lastSeenAt: ctx.seenAt > existing.lastSeenAt ? ctx.seenAt : existing.lastSeenAt,
          title: p.title,
          company: p.company,
          location: p.location,
          url: p.url,
        };
        const changed = (Object.keys(next) as (keyof typeof next)[]).some((k) => next[k] !== existing[k]);
        if (changed) tx.update(leads).set({ ...next, updatedAt: now }).where(eq(leads.id, existing.id)).run();
        continue;
      }
      tx.insert(leads)
        .values({
          id: newId("lead"),
          source: "linkedin",
          externalId: p.externalId,
          title: p.title,
          company: p.company,
          location: p.location,
          url: p.url,
          emailId: ctx.emailId,
          firstSeenAt: ctx.seenAt,
          lastSeenAt: ctx.seenAt,
          status: "new",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      inserted += 1;
    }
    return inserted;
  });
}

/** Scan every stored email that looks like a job digest (oldest first). Idempotent. */
export function backfillLeads(db: Db = getDb()): BackfillSummary {
  const rows = db
    .select({ id: emails.id, fromAddr: emails.fromAddr, bodyText: emails.bodyText, receivedAt: emails.receivedAt })
    .from(emails)
    .where(like(emails.bodyText, JOB_VIEW_LIKE))
    .orderBy(emails.receivedAt)
    .all();
  const summary: BackfillSummary = { emailsScanned: 0, found: 0, inserted: 0 };
  for (const row of rows) {
    const r = extractLeadsFromEmail(row, db);
    if (r.found === 0) continue;
    summary.emailsScanned += 1;
    summary.found += r.found;
    summary.inserted += r.inserted;
  }
  return summary;
}

// ── Reads / status ────────────────────────────────────────────────────────

export type LeadFilter = { status: LeadStatus | "all" };

/** Newest sighting first. */
export function listLeads(filter: LeadFilter = { status: "new" }, db: Db = getDb()): Lead[] {
  const q = db.select().from(leads);
  const rows = filter.status === "all" ? q.all() : q.where(eq(leads.status, filter.status)).all();
  return rows.sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : a.lastSeenAt > b.lastSeenAt ? -1 : 0));
}

export function getLead(id: string, db: Db = getDb()): Lead | null {
  return db.select().from(leads).where(eq(leads.id, id)).get() ?? null;
}

export function countNewLeads(db: Db = getDb()): number {
  const row = db.select({ n: sql<number>`count(*)` }).from(leads).where(eq(leads.status, "new")).get();
  return row?.n ?? 0;
}

export function countLeadsByStatus(db: Db = getDb()): Record<LeadStatus, number> {
  const rows = db.select({ status: leads.status, n: sql<number>`count(*)` }).from(leads).groupBy(leads.status).all();
  const out: Record<LeadStatus, number> = { new: 0, dismissed: 0, applied: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

export function setLeadStatus(id: string, status: LeadStatus, db: Db = getDb()): boolean {
  const res = db.update(leads).set({ status, updatedAt: new Date().toISOString() }).where(eq(leads.id, id)).run();
  return res.changes > 0;
}

/** Called after the prefilled application is created: link it and leave `new`. */
export function markLeadApplied(id: string, applicationId: string, db: Db = getDb()): boolean {
  const res = db
    .update(leads)
    .set({ status: "applied", applicationId, updatedAt: new Date().toISOString() })
    .where(eq(leads.id, id))
    .run();
  return res.changes > 0;
}
