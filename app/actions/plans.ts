"use server";

import { revalidatePath } from "next/cache";
import { buildPlanForApplication } from "@/lib/planner";
import { completeProject, deletePlan, getPlan, getPlanItem, setPlanItemStatus } from "@/lib/plans";
import { idSchema } from "@/lib/validation";

type Fail = { ok: false; error: string };

/** Build (or rebuild) the plan for an application from its stored gap list. */
export async function generatePlanAction(applicationId: string): Promise<{ ok: true; planId: string; items: number } | Fail> {
  const id = idSchema.safeParse(applicationId);
  if (!id.success) return { ok: false, error: "Invalid application id" };
  const result = await buildPlanForApplication(id.data);
  if (!result.ok) return result;
  revalidatePath(`/applications/${id.data}`);
  revalidatePath("/plans");
  return result;
}

export async function setPlanItemStatusAction(itemId: string, status: "todo" | "doing" | "done"): Promise<{ ok: true } | Fail> {
  const id = idSchema.safeParse(itemId);
  if (!id.success) return { ok: false, error: "Invalid item id" };
  const item = getPlanItem(id.data);
  if (!item) return { ok: false, error: "Item not found" };
  if (item.kind === "project" && status === "done") {
    return { ok: false, error: "Use the confirm dialog to complete a project — it updates your master profile." };
  }
  setPlanItemStatus(id.data, status);
  revalidateFor(item.planId);
  return { ok: true };
}

export async function completeProjectAction(
  itemId: string,
): Promise<{ ok: true; addedBullet: boolean; addedSkills: string[]; refreshedApplications: number } | Fail> {
  const id = idSchema.safeParse(itemId);
  if (!id.success) return { ok: false, error: "Invalid item id" };
  const item = getPlanItem(id.data);
  if (!item) return { ok: false, error: "Item not found" };
  const result = completeProject(id.data);
  if ("error" in result) return { ok: false, error: result.error };
  revalidateFor(item.planId);
  revalidatePath("/resume");
  revalidatePath("/");
  return { ok: true, addedBullet: result.addedBullet, addedSkills: result.addedSkills, refreshedApplications: result.refreshedApplications };
}

export async function deletePlanAction(planId: string): Promise<{ ok: true } | Fail> {
  const id = idSchema.safeParse(planId);
  if (!id.success) return { ok: false, error: "Invalid plan id" };
  const plan = getPlan(id.data);
  if (!plan) return { ok: false, error: "Plan not found" };
  deletePlan(plan.id);
  revalidateFor(plan.id, plan.applicationId);
  return { ok: true };
}

function revalidateFor(planId: string, applicationId?: string | null) {
  const appId = applicationId ?? getPlan(planId)?.applicationId ?? null;
  if (appId) revalidatePath(`/applications/${appId}`);
  revalidatePath("/plans");
}
