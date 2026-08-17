/** Learning-plan generator (SPEC §6.4 / §7 "Planner"). Sonnet. */
import { z } from "zod";
import { MODELS, callStructured, type ClaudeResult } from "../claude";
import type { MasterProfile, Requirements } from "../profile";

export const planItemSchema = z.object({
  kind: z.enum(["learn", "project"]),
  title: z.string(),
  detail: z.string(),
  /** Free-first learning resource (docs, course, book, video). "" for projects. */
  resource_url: z.string(),
  /** Skill slugs this item builds; projects: what completing it lets the profile claim. */
  skills: z.array(z.string()),
  /** Projects only: concrete, checkable definition of done. */
  definition_of_done: z.string(),
  /** Projects only: the resume bullet completing this project would justify (no invented metrics). */
  evidence_bullet: z.string(),
});

export const planSchema = z.object({
  goal: z.string(),
  items: z.array(planItemSchema),
});
export type PlanDraft = z.infer<typeof planSchema>;
export type PlanItemDraft = z.infer<typeof planItemSchema>;

const SYSTEM = `You build a focused learning roadmap for a job seeker whose resume is weak for a specific role.

Input: the gap list (required skills the profile lacks, must-haves first), the role family, seniority, and the candidate's existing profile.

Output a plan:
- goal: one sentence naming the role family and what the plan closes.
- items, in priority order (highest impact for THIS role family first):
  * kind "learn": one item per gap that matters, each with ONE high-quality resource. Prefer free, primary sources (official docs, free courses, well-known free books/videos); resource_url must be a real, well-known URL. detail: what to learn and roughly how long (hours/days).
  * kind "project": 1 or 2 scoped portfolio projects that exercise several gaps together and build on the candidate's existing strengths. detail: scope in 2-3 sentences. definition_of_done: a concrete checklist a stranger could verify (repo public, feature X works, tests, README). evidence_bullet: the resume bullet the candidate could honestly add after finishing — describe what was built and with which technologies; do NOT invent metrics, users or employers.
- skills: canonical lowercase slugs (react, postgresql, ci-cd) — for projects, the gap slugs it covers.
Keep it realistic: 4-8 learn items, ≤ 2 projects. Skip gaps that are trivial given the profile.`;

export async function generatePlan(input: {
  gaps: string[];
  requirements: Requirements | null;
  profile: MasterProfile;
  job: { company: string; roleTitle: string } | null;
}): Promise<ClaudeResult<PlanDraft>> {
  const roleFamily = input.requirements?.role_family ?? "unknown";
  const user = [
    input.job ? `Target: ${input.job.roleTitle} at ${input.job.company}` : "Target: general upskilling",
    `Role family: ${roleFamily}; seniority: ${input.requirements?.seniority ?? "unknown"}`,
    `Gaps (must-haves first): ${input.gaps.join(", ") || "(none)"}`,
    input.requirements ? `Keywords: ${input.requirements.keywords.join(", ")}` : "",
    "",
    "Candidate profile (JSON):",
    JSON.stringify(
      {
        summary: input.profile.summary,
        skills: input.profile.skills.map((s) => s.name),
        experience: input.profile.experience.map((e) => ({ title: e.title, company: e.company, bullets: e.bullets.map((b) => b.text) })),
        projects: input.profile.projects.map((p) => ({ name: p.name, bullets: p.bullets.map((b) => b.text) })),
      },
      null,
      0,
    ),
  ]
    .filter(Boolean)
    .join("\n");

  return callStructured({
    model: MODELS.smart,
    system: SYSTEM,
    user,
    schema: planSchema,
    maxTokens: 8000,
    effort: "medium",
    mock: () => mockPlan(input.gaps, roleFamily),
  });
}

const RESOURCES: Record<string, string> = {
  react: "https://react.dev/learn",
  typescript: "https://www.typescriptlang.org/docs/handbook/intro.html",
  nextjs: "https://nextjs.org/learn",
  nodejs: "https://nodejs.org/en/learn",
  postgresql: "https://www.postgresql.org/docs/current/tutorial.html",
  sql: "https://sqlbolt.com/",
  docker: "https://docs.docker.com/get-started/",
  kubernetes: "https://kubernetes.io/docs/tutorials/kubernetes-basics/",
  aws: "https://aws.amazon.com/getting-started/",
  graphql: "https://graphql.org/learn/",
  python: "https://docs.python.org/3/tutorial/",
  go: "https://go.dev/tour/",
  rust: "https://doc.rust-lang.org/book/",
  css: "https://web.dev/learn/css",
  playwright: "https://playwright.dev/docs/intro",
  cypress: "https://docs.cypress.io/app/get-started/why-cypress",
  vitest: "https://vitest.dev/guide/",
  d3: "https://d3js.org/getting-started",
  recharts: "https://recharts.org/en-US/guide",
  wcag: "https://www.w3.org/WAI/WCAG22/quickref/",
};

/** Deterministic stand-in for JOBPILOT_MOCK_AI=1. */
export function mockPlan(gaps: string[], roleFamily: string): PlanDraft {
  const top = gaps.slice(0, 6);
  const learn: PlanItemDraft[] = top.map((g) => ({
    kind: "learn",
    title: `Learn ${g}`,
    detail: `Work through the fundamentals of ${g} (about 6-10 hours) and build one small exercise with it.`,
    resource_url: RESOURCES[g] ?? `https://roadmap.sh/?s=${encodeURIComponent(g)}`,
    skills: [g],
    definition_of_done: "",
    evidence_bullet: "",
  }));
  const proj: PlanItemDraft[] = top.length
    ? [
        {
          kind: "project",
          title: `Portfolio project: ${roleFamily} app using ${top.slice(0, 3).join(", ")}`,
          detail: `Build and publish a small but complete ${roleFamily} application that uses ${top.slice(0, 3).join(", ")} end to end.`,
          resource_url: "",
          skills: top.slice(0, 3),
          definition_of_done: "Public repository with README; core feature works from a clean checkout; automated tests pass in CI.",
          evidence_bullet: `Built and shipped a ${roleFamily} project using ${top.slice(0, 3).join(", ")}, with automated tests and a documented setup.`,
        },
      ]
    : [];
  return { goal: `Close the ${roleFamily} gaps: ${top.join(", ") || "none"}.`, items: [...learn, ...proj] };
}
