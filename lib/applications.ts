/**
 * Application data access (SPEC §6.1). Every status change goes through
 * `transitionApplication`, which enforces the state machine and appends an
 * immutable status_event.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "./db";
import { applications, statusEvents, type Application, type StatusEvent } from "./db/schema";
import { newId } from "./ids";
import { ACTIVE_STATUSES, canTransition, isStatus, type Source, type Status } from "./stateMachine";

export type ApplicationInput = {
  company: string;
  roleTitle: string;
  jdText: string;
  sourceUrl?: string | null;
  location?: string | null;
  companyDomains?: string | null;
  /** ISO date (YYYY-MM-DD or full ISO). Defaults to now. */
  appliedAt?: string | null;
};

export type ApplicationWithStatus = Omit<Application, "status"> & { status: Status };

const nowIso = () => new Date().toISOString();

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Date-only input (from <input type="date">) is local midnight, not UTC midnight. */
function normaliseAppliedAt(value?: string | null): string {
  if (!value) return nowIso();
  const m = DATE_ONLY.exec(value.trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? nowIso() : d.toISOString();
}

/** Narrow the DB `status` text column to the Status union (defensive). */
export function withStatus(row: Application): ApplicationWithStatus {
  if (!isStatus(row.status)) {
    throw new Error(`Application ${row.id} has unknown status "${row.status}"`);
  }
  return { ...row, status: row.status };
}

export function listApplications(db: Db = getDb()): ApplicationWithStatus[] {
  return db.select().from(applications).orderBy(desc(applications.updatedAt)).all().map(withStatus);
}

export function listActiveApplications(db: Db = getDb()): ApplicationWithStatus[] {
  return db
    .select()
    .from(applications)
    .where(inArray(applications.status, [...ACTIVE_STATUSES]))
    .orderBy(desc(applications.updatedAt))
    .all()
    .map(withStatus);
}

export function getApplication(id: string, db: Db = getDb()): ApplicationWithStatus | null {
  const row = db.select().from(applications).where(eq(applications.id, id)).get();
  return row ? withStatus(row) : null;
}

export function getTimeline(applicationId: string, db: Db = getDb()): StatusEvent[] {
  return db
    .select()
    .from(statusEvents)
    .where(eq(statusEvents.applicationId, applicationId))
    .orderBy(asc(statusEvents.createdAt), asc(statusEvents.id))
    .all();
}

export function createApplication(input: ApplicationInput, db: Db = getDb()): ApplicationWithStatus {
  const id = newId("application");
  const appliedAt = normaliseAppliedAt(input.appliedAt);
  return db.transaction((tx) => {
    tx.insert(applications)
      .values({
        id,
        company: input.company.trim(),
        roleTitle: input.roleTitle.trim(),
        jdText: input.jdText.trim(),
        sourceUrl: input.sourceUrl?.trim() || null,
        location: input.location?.trim() || null,
        companyDomains: input.companyDomains?.trim() || null,
        appliedAt,
        status: "applied",
        createdAt: appliedAt,
        updatedAt: nowIso(),
      })
      .run();
    tx.insert(statusEvents)
      .values({
        id: newId("statusEvent"),
        applicationId: id,
        fromStatus: null,
        toStatus: "applied",
        source: "manual",
        note: "Application created",
        createdAt: appliedAt,
      })
      .run();
    const created = tx.select().from(applications).where(eq(applications.id, id)).get();
    if (!created) throw new Error("Insert failed");
    return withStatus(created);
  });
}

export function updateApplication(
  id: string,
  patch: Partial<ApplicationInput>,
  db: Db = getDb(),
): ApplicationWithStatus | null {
  const existing = getApplication(id, db);
  if (!existing) return null;
  db.update(applications)
    .set({
      ...(patch.company !== undefined ? { company: patch.company.trim() } : {}),
      ...(patch.roleTitle !== undefined ? { roleTitle: patch.roleTitle.trim() } : {}),
      ...(patch.jdText !== undefined ? { jdText: patch.jdText.trim() } : {}),
      ...(patch.sourceUrl !== undefined ? { sourceUrl: patch.sourceUrl?.trim() || null } : {}),
      ...(patch.location !== undefined ? { location: patch.location?.trim() || null } : {}),
      ...(patch.companyDomains !== undefined
        ? { companyDomains: patch.companyDomains?.trim() || null }
        : {}),
      ...(patch.appliedAt !== undefined ? { appliedAt: normaliseAppliedAt(patch.appliedAt) } : {}),
      updatedAt: nowIso(),
    })
    .where(eq(applications.id, id))
    .run();
  return getApplication(id, db);
}

export function deleteApplication(id: string, db: Db = getDb()): boolean {
  const result = db.delete(applications).where(eq(applications.id, id)).run();
  return result.changes > 0;
}

export type TransitionOutcome =
  | { ok: true; application: ApplicationWithStatus; event: StatusEvent }
  | { ok: false; reason: string; application: ApplicationWithStatus | null };

/**
 * Move an application to a new status. Refused moves return `{ ok:false, reason }`
 * and write nothing — callers surface the reason (toast / review queue).
 */
export function transitionApplication(
  id: string,
  to: Status,
  source: Source,
  opts: { emailId?: string | null; note?: string | null } = {},
  db: Db = getDb(),
): TransitionOutcome {
  const application = getApplication(id, db);
  if (!application) return { ok: false, reason: "Application not found.", application: null };

  const verdict = canTransition(application.status, to, source);
  if (!verdict.ok) return { ok: false, reason: verdict.reason, application };

  return db.transaction((tx) => {
    let note = opts.note ?? null;
    if (application.status === "interview" && to === "interview") {
      const priorRounds = tx
        .select({ id: statusEvents.id })
        .from(statusEvents)
        .where(and(eq(statusEvents.applicationId, id), eq(statusEvents.toStatus, "interview")))
        .all().length;
      const roundNote = `Interview round ${priorRounds + 1}`;
      note = note ? `${roundNote} — ${note}` : roundNote;
    }
    const event = tx
      .insert(statusEvents)
      .values({
        id: newId("statusEvent"),
        applicationId: id,
        fromStatus: application.status,
        toStatus: to,
        source,
        emailId: opts.emailId ?? null,
        note,
        createdAt: nowIso(),
      })
      .returning()
      .get();
    tx.update(applications)
      .set({ status: to, ghosted: false, updatedAt: nowIso() })
      .where(eq(applications.id, id))
      .run();
    const updated = tx.select().from(applications).where(eq(applications.id, id)).get();
    if (!updated) throw new Error("Application vanished mid-transaction");
    return { ok: true, application: withStatus(updated), event };
  });
}
