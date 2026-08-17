/** JD → requirements (SPEC §6.2 "JD extraction", §7 "JD extractor"). Haiku, temperature 0. */
import { MODELS, callStructured, type ClaudeResult } from "../claude";
import { requirementsSchema, slugify, type MasterProfile, type Requirements } from "../profile";
import { profileSlugSet } from "../fit";
import { mockRequirements } from "./mocks";

const SYSTEM = `You extract hiring requirements from a job description.

Output fields:
- must_have: skills/technologies/qualifications the posting treats as required ("must", "required", "essential", "you have", "minimum").
- nice_to_have: explicitly optional ones ("nice to have", "bonus", "preferred", "desirable", "plus").
- seniority: one of "intern", "junior", "mid", "senior", "lead", "principal", "manager", "director", "unknown".
- keywords: 5-15 short phrases an ATS would match on (tools, methods, domain terms).
- role_family: a short lowercase family such as "frontend", "backend", "fullstack", "data-engineering", "data-science", "devops", "mobile", "product", "design", "qa", "security", "other".

skill_slug rules (important):
- lowercase, words joined by "-", no spaces or punctuation: "react", "sql", "stakeholder-management", "aws", "ci-cd", "nodejs", "csharp", "cpp".
- One requirement per distinct skill; do not repeat a slug.
- If a requirement is a synonym or variant of a slug in the "known profile slugs" list, use that exact slug (e.g. "React.js" -> "react", "Postgres" -> "postgresql" if that is what the profile uses).
- Skip generic filler ("team player", "communication") unless the posting clearly lists it as a requirement — then use a specific slug like "communication".
- evidence: the shortest quote from the posting that supports the requirement.`;

export async function extractRequirements(
  jdText: string,
  profile: MasterProfile | null,
): Promise<ClaudeResult<Requirements>> {
  const known = profile ? [...profileSlugSet(profile)].sort() : [];
  const user = [
    `Known profile slugs (prefer these when a requirement matches one): ${known.length ? known.join(", ") : "(none yet)"}`,
    "",
    "Job description:",
    jdText.slice(0, 40_000),
  ].join("\n");

  const result = await callStructured({
    model: MODELS.fast,
    system: SYSTEM,
    user,
    schema: requirementsSchema,
    maxTokens: 4000,
    temperature: 0,
    mock: () => mockRequirements(jdText),
  });
  if (!result.ok) return result;

  // Canonicalise slugs defensively (the model is instructed to, but enforce it).
  const canon = (items: Requirements["must_have"]) => {
    const seen = new Set<string>();
    return items
      .map((it) => ({ ...it, skill_slug: slugify(it.skill_slug) }))
      .filter((it) => it.skill_slug && !seen.has(it.skill_slug) && seen.add(it.skill_slug));
  };
  const data: Requirements = {
    ...result.data,
    must_have: canon(result.data.must_have),
    nice_to_have: canon(result.data.nice_to_have).filter(
      (n) => !result.data.must_have.some((m) => slugify(m.skill_slug) === n.skill_slug),
    ),
    role_family: slugify(result.data.role_family) || "other",
    seniority: result.data.seniority.toLowerCase().trim() || "unknown",
  };
  return { ok: true, data, usage: result.usage };
}
