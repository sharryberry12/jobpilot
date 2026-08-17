/**
 * Resume tailoring (SPEC §6.2 "Tailoring", §7 "Resume tailor"). Sonnet.
 * The validator is the guardrail: on failure we regenerate once with the
 * errors fed back; if it still fails we surface the failure — never bypass.
 */
import { MODELS, callStructured, type ClaudeResult } from "../claude";
import {
  tailoredProfileSchema,
  type MasterProfile,
  type Requirements,
  type TailoredProfile,
} from "../profile";
import { validateTailored, type ValidationError } from "../validate";
import { mockTailored } from "./mocks";

const SYSTEM = `You tailor a candidate's master resume profile to a specific job. You are given the master profile (every skill, experience entry, project and bullet has an id) and the extracted job requirements.

Return a tailored subset of the SAME facts:
- summary: 2-3 sentences targeted at this role, using only facts present in the profile.
- skills: the profile skills most relevant to the role first, as { "source_id": <skill id> }. Only ids that exist. Omit irrelevant skills.
- experience: entries in the most relevant order, each { "source_id": <experience id>, "bullets": [...] }. Keep every entry that has any relevance; you may omit clearly irrelevant ones.
- projects: same shape as experience.
- Each bullet is { "source_id": <bullet id>, "text": <rephrased bullet> }. A bullet may cite only ids that belong to that entry.

Hard rules (a validator enforces these; violations are rejected):
- Rephrase and reorder only. Never add tools, technologies, metrics, numbers, employers, titles or dates that are not in the source bullet you cite. Omission is allowed; invention is not.
- Do not merge two source bullets into one, and do not cite a bullet id twice.
- Emphasise keywords from the requirements ONLY where the source bullet already supports them.
- Keep bullets concise (one line, strong verb first).`;

export type TailorOutcome =
  | { ok: true; tailored: TailoredProfile; attempts: number }
  | { ok: false; code: string; error: string; validationErrors?: ValidationError[]; tailored?: TailoredProfile };

function buildUser(
  profile: MasterProfile,
  requirements: Requirements,
  job: { company: string; roleTitle: string },
  previousErrors?: ValidationError[],
): string {
  const parts = [
    `Target role: ${job.roleTitle} at ${job.company}`,
    "",
    "Extracted requirements (JSON):",
    JSON.stringify(requirements, null, 0),
    "",
    "Master profile (JSON, with ids):",
    JSON.stringify(profile, null, 0),
  ];
  if (previousErrors?.length) {
    parts.push(
      "",
      "Your previous attempt was rejected by the validator for these reasons. Fix every one of them:",
      ...previousErrors.map((e) => `- ${e.path}: ${e.message}${e.detail ? ` (${e.detail})` : ""}`),
    );
  }
  return parts.join("\n");
}

export async function tailorResume(
  profile: MasterProfile,
  requirements: Requirements,
  job: { company: string; roleTitle: string },
): Promise<TailorOutcome> {
  let previousErrors: ValidationError[] | undefined;
  let last: { tailored: TailoredProfile; errors: ValidationError[] } | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result: ClaudeResult<TailoredProfile> = await callStructured({
      model: MODELS.smart,
      system: SYSTEM,
      user: buildUser(profile, requirements, job, previousErrors),
      schema: tailoredProfileSchema,
      maxTokens: 16_000,
      effort: "medium",
      mock: () => mockTailored(profile, requirements),
    });
    if (!result.ok) return { ok: false, code: result.code, error: result.error };

    const validation = validateTailored(profile, result.data);
    if (validation.ok) return { ok: true, tailored: result.data, attempts: attempt };
    last = { tailored: result.data, errors: validation.errors };
    previousErrors = validation.errors;
  }

  return {
    ok: false,
    code: "validation_failed",
    error: `Tailored resume failed the no-fabrication check after 2 attempts (${last?.errors.length ?? 0} issue(s)).`,
    validationErrors: last?.errors,
    tailored: last?.tailored,
  };
}
