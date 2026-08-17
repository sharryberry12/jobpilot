/** Data access for learning plans (SPEC §6.4) incl. the done-flow that grows the master profile. */
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { PlanDraft } from "./ai/plan";
import { getDb, type Db } from "./db";
import { applications, planItems, plans, type Plan, type PlanItem } from "./db/schema";
import { newId } from "./ids";
import { parseSkills } from "./plan-utils";
import { slugify, type MasterProfile } from "./profile";
import { getMasterProfile, getRequirements, refreshFit, saveMasterProfile } from "./resume";
import { ACTIVE_STATUSES } from "./stateMachine";

const nowIso = () => new Date().toISOString();

export type PlanWithItems = Plan & {
  items: PlanItem[];
  application: { id: string; company: string; roleTitle: string; status: string; fitScore: number | null } | null;
};

export function createPlan(applicationId: string | null, draft: PlanDraft, db: Db = getDb()): PlanWithItems {
  const id = newId("plan");
  db.transaction((tx) => {
    tx.insert(plans).values({ id, applicationId, goal: draft.goal.trim() || "Learning plan", createdAt: nowIso() }).run();
    draft.items.forEach((item, i) => {
      tx.insert(planItems)
        .values({
          id: newId("planItem"),
          planId: id,
          kind: item.kind,
          title: item.title.trim(),
          detail: item.detail.trim() || null,
          resourceUrl: item.kind === "learn" && item.resource_url.trim() ? item.resource_url.trim() : null,
          status: "todo",
          evidenceBullet: item.kind === "project" && item.evidence_bullet.trim() ? item.evidence_bullet.trim() : null,
          definitionOfDone: item.kind === "project" && item.definition_of_done.trim() ? item.definition_of_done.trim() : null,
          skillsJson: JSON.stringify(item.skills.map((s) => s.trim()).filter(Boolean)),
          position: i,
        })
        .run();
    });
  });
  return getPlan(id, db)!;
}

function attachItems(plan: Plan, db: Db): PlanWithItems {
  const items = db.select().from(planItems).where(eq(planItems.planId, plan.id)).orderBy(asc(planItems.position)).all();
  const application = plan.applicationId
    ? db
        .select({ id: applications.id, company: applications.company, roleTitle: applications.roleTitle, status: applications.status, fitScore: applications.fitScore })
        .from(applications)
        .where(eq(applications.id, plan.applicationId))
        .get() ?? null
    : null;
  return { ...plan, items, application };
}

export function getPlan(id: string, db: Db = getDb()): PlanWithItems | null {
  const plan = db.select().from(plans).where(eq(plans.id, id)).get();
  return plan ? attachItems(plan, db) : null;
}

export function getPlanForApplication(applicationId: string, db: Db = getDb()): PlanWithItems | null {
  const plan = db.select().from(plans).where(eq(plans.applicationId, applicationId)).orderBy(desc(plans.createdAt)).get();
  return plan ? attachItems(plan, db) : null;
}

export function listPlans(db: Db = getDb()): PlanWithItems[] {
  return db.select().from(plans).orderBy(desc(plans.createdAt)).all().map((p) => attachItems(p, db));
}

export function deletePlan(id: string, db: Db = getDb()): boolean {
  return db.delete(plans).where(eq(plans.id, id)).run().changes > 0;
}

export function getPlanItem(id: string, db: Db = getDb()): PlanItem | null {
  return db.select().from(planItems).where(eq(planItems.id, id)).get() ?? null;
}

export function setPlanItemStatus(id: string, status: PlanItem["status"], db: Db = getDb()): PlanItem | null {
  return (
    db
      .update(planItems)
      .set({ status, completedAt: status === "done" ? nowIso() : null })
      .where(eq(planItems.id, id))
      .returning()
      .get() ?? null
  );
}

export type CompleteProjectResult = {
  item: PlanItem;
  addedBullet: boolean;
  addedSkills: string[];
  refreshedApplications: number;
};

/**
 * Done-flow for a project item (SPEC §6.4): append its evidence bullet (as a
 * new project on the master profile) plus any new skills, then recompute fit
 * for open applications in the same role family — which mechanically improves
 * their scores.
 */
export function completeProject(itemId: string, db: Db = getDb()): CompleteProjectResult | { error: string } {
  const item = getPlanItem(itemId, db);
  if (!item) return { error: "Plan item not found" };
  if (item.kind !== "project") return { error: "Only project items add evidence to the profile" };
  const master = getMasterProfile(db);
  if (!master) return { error: "Upload your master resume first" };

  const profile: MasterProfile = master.profile;
  const existingSlugs = new Set(profile.skills.map((s) => slugify(s.name)));
  const newSkills = parseSkills(item.skillsJson).filter((s) => s && !existingSlugs.has(slugify(s)));
  const skills = [
    ...profile.skills,
    ...newSkills.map((name) => ({ id: `sk_${slugify(name).replace(/-/g, "_")}`, name, level: "portfolio project" })),
  ];
  const projects = item.evidenceBullet
    ? [...profile.projects, { id: `pr_${item.id}`, name: item.title, bullets: [{ id: `b_${item.id}`, text: item.evidenceBullet }] }]
    : profile.projects;

  saveMasterProfile({ ...profile, skills, projects }, {}, db);
  const updated = setPlanItemStatus(item.id, "done", db)!;

  // Recompute fit for open applications in the same role family (all, if unknown).
  const plan = db.select().from(plans).where(eq(plans.id, item.planId)).get();
  const family = plan?.applicationId ? getRequirements(plan.applicationId, db)?.role_family ?? null : null;
  const openApps = db
    .select({ id: applications.id })
    .from(applications)
    .where(inArray(applications.status, [...ACTIVE_STATUSES]))
    .all();
  let refreshed = 0;
  for (const a of openApps) {
    if (family) {
      const reqs = getRequirements(a.id, db);
      if (!reqs || reqs.role_family !== family) continue;
    }
    if (refreshFit(a.id, db)) refreshed += 1;
  }
  return { item: updated, addedBullet: Boolean(item.evidenceBullet), addedSkills: newSkills, refreshedApplications: refreshed };
}
