/** Builds (or rebuilds) an application's learning plan from its stored gap list (SPEC §6.4). */
import { generatePlan } from "./ai/plan";
import { getApplication } from "./applications";
import { parseFitJson } from "./fit";
import { createPlan, deletePlan, getPlanForApplication } from "./plans";
import { getMasterProfile, getRequirements } from "./resume";

export type BuildPlanResult = { ok: true; planId: string; items: number } | { ok: false; error: string };

/** Replaces any existing plan for the application. */
export async function buildPlanForApplication(applicationId: string): Promise<BuildPlanResult> {
  try {
    return await buildPlanUnsafe(applicationId);
  } catch (err) {
    console.error("[planner] build failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Plan generation failed" };
  }
}

async function buildPlanUnsafe(applicationId: string): Promise<BuildPlanResult> {
  const app = getApplication(applicationId);
  if (!app) return { ok: false, error: "Application not found" };
  const master = getMasterProfile();
  if (!master) return { ok: false, error: "Upload your master resume first — plans are built from your gaps." };
  const requirements = getRequirements(app.id);
  const fit = parseFitJson(app.fitJson);
  const gaps = fit?.gaps ?? [];
  if (!requirements || gaps.length === 0) {
    return { ok: false, error: requirements ? "No gaps to plan for — the profile already covers this role's requirements." : "Extract requirements first." };
  }
  const result = await generatePlan({ gaps, requirements, profile: master.profile, job: { company: app.company, roleTitle: app.roleTitle } });
  if (!result.ok) return { ok: false, error: result.error };
  if (result.data.items.length === 0) return { ok: false, error: "The planner returned no items." };
  const existing = getPlanForApplication(app.id);
  if (existing) deletePlan(existing.id);
  const plan = createPlan(app.id, result.data);
  return { ok: true, planId: plan.id, items: plan.items.length };
}

