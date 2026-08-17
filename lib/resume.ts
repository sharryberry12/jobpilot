/** Data access for the resume engine: master profile, requirements, fit, resume versions. */
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "./db";
import {
  applications,
  requirements as requirementsTable,
  resumeMaster,
  resumeVersions,
  type ResumeVersion,
} from "./db/schema";
import { computeFit, parseFitJson, type FitResult } from "./fit";
import { newId } from "./ids";
import {
  masterProfileSchema,
  normaliseProfile,
  requirementsSchema,
  tailoredProfileSchema,
  type MasterProfile,
  type Requirements,
  type TailoredProfile,
} from "./profile";
import { ACTIVE_STATUSES } from "./stateMachine";

const MASTER_ID = "master";
const nowIso = () => new Date().toISOString();

// ── Master profile ─────────────────────────────────────────────────────────

export type MasterProfileRow = { profile: MasterProfile; sourceFilename: string | null; updatedAt: string };

export function getMasterProfile(db: Db = getDb()): MasterProfileRow | null {
  const row = db.select().from(resumeMaster).where(eq(resumeMaster.id, MASTER_ID)).get();
  if (!row) return null;
  try {
    const profile = masterProfileSchema.parse(JSON.parse(row.profileJson));
    return { profile, sourceFilename: row.sourceFilename, updatedAt: row.updatedAt };
  } catch (err) {
    console.error("[resume] stored master profile is invalid; ignoring", err);
    return null;
  }
}

export function saveMasterProfile(
  input: unknown,
  opts: { sourceFilename?: string | null } = {},
  db: Db = getDb(),
): MasterProfile {
  const profile = normaliseProfile(input);
  const existing = db.select({ sourceFilename: resumeMaster.sourceFilename }).from(resumeMaster).where(eq(resumeMaster.id, MASTER_ID)).get();
  const sourceFilename = opts.sourceFilename !== undefined ? opts.sourceFilename : existing?.sourceFilename ?? null;
  db.insert(resumeMaster)
    .values({ id: MASTER_ID, profileJson: JSON.stringify(profile), sourceFilename, updatedAt: nowIso() })
    .onConflictDoUpdate({
      target: resumeMaster.id,
      set: { profileJson: JSON.stringify(profile), sourceFilename, updatedAt: nowIso() },
    })
    .run();
  return profile;
}

// ── Requirements ───────────────────────────────────────────────────────────

export function getRequirements(applicationId: string, db: Db = getDb()): Requirements | null {
  const row = db
    .select()
    .from(requirementsTable)
    .where(eq(requirementsTable.applicationId, applicationId))
    .orderBy(desc(requirementsTable.createdAt))
    .get();
  if (!row) return null;
  const parsed = requirementsSchema.safeParse(JSON.parse(row.extractedJson));
  return parsed.success ? parsed.data : null;
}

export function saveRequirements(applicationId: string, reqs: Requirements, db: Db = getDb()): void {
  db.transaction((tx) => {
    tx.delete(requirementsTable).where(eq(requirementsTable.applicationId, applicationId)).run();
    tx.insert(requirementsTable)
      .values({ id: newId("requirement"), applicationId, extractedJson: JSON.stringify(reqs), createdAt: nowIso() })
      .run();
  });
}

// ── Fit ────────────────────────────────────────────────────────────────────

/** Recompute + persist fit for one application. Returns null if profile or requirements are missing. */
export function refreshFit(applicationId: string, db: Db = getDb()): FitResult | null {
  const master = getMasterProfile(db);
  const reqs = getRequirements(applicationId, db);
  if (!master || !reqs) return null;
  const fit = computeFit(master.profile, reqs);
  db.update(applications)
    .set({ fitScore: fit.score, fitJson: JSON.stringify(fit), updatedAt: nowIso() })
    .where(eq(applications.id, applicationId))
    .run();
  return fit;
}

/** Recompute fit for every active application (after the master profile changes). */
export function refreshAllFits(db: Db = getDb()): number {
  const rows = db
    .select({ id: applications.id })
    .from(applications)
    .where(inArray(applications.status, [...ACTIVE_STATUSES]))
    .all();
  let n = 0;
  for (const r of rows) if (refreshFit(r.id, db)) n += 1;
  return n;
}

export function getStoredFit(fitJson: string | null): FitResult | null {
  return parseFitJson(fitJson);
}

// ── Resume versions ────────────────────────────────────────────────────────

export type ResumeVersionRow = Omit<ResumeVersion, "tailoredJson"> & { tailored: TailoredProfile };

function rowToVersion(row: ResumeVersion): ResumeVersionRow | null {
  const parsed = tailoredProfileSchema.safeParse(JSON.parse(row.tailoredJson));
  if (!parsed.success) return null;
  const { tailoredJson: _ignored, ...rest } = row;
  void _ignored;
  return { ...rest, tailored: parsed.data };
}

export function createResumeVersion(applicationId: string, tailored: TailoredProfile, db: Db = getDb()): ResumeVersionRow {
  const id = newId("resumeVersion");
  const row = db
    .insert(resumeVersions)
    .values({ id, applicationId, tailoredJson: JSON.stringify(tailored), approved: false, createdAt: nowIso() })
    .returning()
    .get();
  return rowToVersion(row)!;
}

export function updateResumeVersion(id: string, tailored: TailoredProfile, db: Db = getDb()): ResumeVersionRow | null {
  const row = db
    .update(resumeVersions)
    .set({ tailoredJson: JSON.stringify(tailored) })
    .where(eq(resumeVersions.id, id))
    .returning()
    .get();
  return row ? rowToVersion(row) : null;
}

export function approveResumeVersion(id: string, docxPath: string, db: Db = getDb()): ResumeVersionRow | null {
  return db.transaction((tx) => {
    const row = tx
      .update(resumeVersions)
      .set({ approved: true, docxPath })
      .where(eq(resumeVersions.id, id))
      .returning()
      .get();
    if (!row) return null;
    tx.update(applications)
      .set({ resumeVersionId: id, updatedAt: nowIso() })
      .where(eq(applications.id, row.applicationId))
      .run();
    return rowToVersion(row);
  });
}

export function getResumeVersion(id: string, db: Db = getDb()): ResumeVersionRow | null {
  const row = db.select().from(resumeVersions).where(eq(resumeVersions.id, id)).get();
  return row ? rowToVersion(row) : null;
}

export function listResumeVersions(applicationId: string, db: Db = getDb()): ResumeVersionRow[] {
  return db
    .select()
    .from(resumeVersions)
    .where(eq(resumeVersions.applicationId, applicationId))
    .orderBy(desc(resumeVersions.createdAt))
    .all()
    .map(rowToVersion)
    .filter((v): v is ResumeVersionRow => v !== null);
}

export function deleteResumeVersion(id: string, db: Db = getDb()): boolean {
  return db.transaction((tx) => {
    const row = tx.select().from(resumeVersions).where(eq(resumeVersions.id, id)).get();
    if (!row) return false;
    tx.delete(resumeVersions).where(eq(resumeVersions.id, id)).run();
    tx.update(applications)
      .set({ resumeVersionId: null })
      .where(eq(applications.resumeVersionId, id))
      .run();
    return true;
  });
}
