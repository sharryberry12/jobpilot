/** Resume text → master profile draft (SPEC §6.2 "Upload & parse"). Haiku, temperature 0. */
import { z } from "zod";
import { MODELS, callStructured, type ClaudeResult } from "../claude";
import { normaliseProfile, type MasterProfile } from "../profile";
import { mockResumeDraft } from "./mocks";

/** What we ask the model for: the §4 shape minus ids (we assign ids ourselves). */
const draftSchema = z.object({
  basics: z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    location: z.string(),
    links: z.array(z.string()),
  }),
  summary: z.string(),
  skills: z.array(z.object({ name: z.string(), level: z.string() })),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      start: z.string(),
      end: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
  projects: z.array(z.object({ name: z.string(), bullets: z.array(z.string()) })),
  education: z.array(
    z.object({ institution: z.string(), degree: z.string(), start: z.string(), end: z.string(), detail: z.string() }),
  ),
  certs: z.array(z.object({ name: z.string(), issuer: z.string(), year: z.string() })),
});

const SYSTEM = `You convert the raw text of a resume into a structured profile.

Rules:
- Copy facts from the text. Never invent employers, titles, dates, skills, metrics or achievements that are not in the text.
- Preserve the original wording of achievement bullets; split multi-sentence paragraphs into one bullet per achievement.
- Skills: list each distinct technology, tool, language, framework, method or domain skill once, using its common name (e.g. "PostgreSQL", "React", "Stakeholder management"). "level" is a short phrase taken from context ("used in production", "familiar", "certified") or "" if unknown.
- Dates: keep the format used in the text (e.g. "2022-03", "Mar 2022", "2021"); use "present" for current roles.
- Use "" for unknown strings and [] for empty lists. Do not add commentary.`;

export async function normaliseResumeText(rawText: string): Promise<ClaudeResult<MasterProfile>> {
  const result = await callStructured({
    model: MODELS.fast,
    system: SYSTEM,
    user: `Resume text:\n\n${rawText.slice(0, 60_000)}`,
    schema: draftSchema,
    maxTokens: 12_000,
    temperature: 0,
    mock: () => mockResumeDraft(rawText),
  });
  if (!result.ok) return result;
  const draft = result.data;
  const profile = normaliseProfile({
    ...draft,
    experience: draft.experience.map((e) => ({ ...e, bullets: e.bullets.map((text) => ({ text })) })),
    projects: draft.projects.map((p) => ({ ...p, bullets: p.bullets.map((text) => ({ text })) })),
  });
  return { ok: true, data: profile, usage: result.usage };
}
