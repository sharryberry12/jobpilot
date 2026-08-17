/**
 * Master profile (SPEC §4 "Master profile JSON shape") and tailored-profile
 * shapes. Every skill, bullet, project and experience entry has a stable id —
 * these are the `source_id`s the tailoring validator checks against.
 */
import { z } from "zod";
import { customAlphabet } from "nanoid";

const short = customAlphabet("0123456789abcdefghijkmnpqrstuvwxyz", 6);

export const bulletSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

export const skillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  level: z.string().default(""),
});

export const experienceSchema = z.object({
  id: z.string().min(1),
  company: z.string().default(""),
  title: z.string().default(""),
  start: z.string().default(""),
  end: z.string().default(""),
  bullets: z.array(bulletSchema).default([]),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  bullets: z.array(bulletSchema).default([]),
});

export const educationSchema = z.object({
  id: z.string().min(1),
  institution: z.string().default(""),
  degree: z.string().default(""),
  start: z.string().default(""),
  end: z.string().default(""),
  detail: z.string().default(""),
});

export const certSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  issuer: z.string().default(""),
  year: z.string().default(""),
});

export const masterProfileSchema = z.object({
  basics: z
    .object({
      name: z.string().default(""),
      email: z.string().default(""),
      phone: z.string().default(""),
      location: z.string().default(""),
      links: z.array(z.string()).default([]),
    })
    .default({ name: "", email: "", phone: "", location: "", links: [] }),
  summary: z.string().default(""),
  skills: z.array(skillSchema).default([]),
  experience: z.array(experienceSchema).default([]),
  projects: z.array(projectSchema).default([]),
  education: z.array(educationSchema).default([]),
  certs: z.array(certSchema).default([]),
});

export type MasterProfile = z.infer<typeof masterProfileSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type Bullet = z.infer<typeof bulletSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Project = z.infer<typeof projectSchema>;

/** Canonical lowercase slug used to compare skills with JD requirements. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/c\+\+/g, "cpp")
    .replace(/c#/g, "csharp")
    .replace(/\.js\b/g, "js")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** All slugs a profile skill answers to (id-derived and name-derived). */
export function skillSlugs(skill: Pick<Skill, "id" | "name">): string[] {
  const out = new Set<string>();
  const s = slugify(skill.name);
  if (s) out.add(s);
  if (skill.id.startsWith("sk_")) out.add(skill.id.slice(3).replace(/_/g, "-"));
  return [...out];
}

export function emptyProfile(): MasterProfile {
  return masterProfileSchema.parse({});
}

const ensureId = (prefix: string, id: string | undefined | null) =>
  id && id.trim() ? id.trim() : `${prefix}_${short()}`;

function dedupeIds<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.map((item) => {
    let id = item.id;
    while (seen.has(id)) id = `${item.id}_${short()}`;
    seen.add(id);
    return id === item.id ? item : { ...item, id };
  });
}

/**
 * Accept a loosely-shaped profile (e.g. from the LLM normaliser or the edit
 * form), fill in any missing ids, and validate. Existing ids are preserved so
 * previously-generated resume versions keep pointing at the same sources.
 */
export function normaliseProfile(input: unknown): MasterProfile {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const arr = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === "object" && x !== null) : [];
  const str = (v: unknown) =>
    typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);

  const bullets = (v: unknown, prefix: string) =>
    arr(v)
      .map((b) => ({ id: ensureId(prefix, str(b.id)), text: str(b.text).trim() }))
      .filter((b) => b.text.length > 0);

  const skills = arr(raw.skills)
    .map((s) => {
      const name = str(s.name).trim();
      const id =
        str(s.id).trim() ||
        (name ? `sk_${slugify(name).replace(/-/g, "_")}` : `sk_${short()}`);
      return { id, name, level: str(s.level).trim() };
    })
    .filter((s) => s.name.length > 0);

  const basics = (
    typeof raw.basics === "object" && raw.basics !== null ? raw.basics : {}
  ) as Record<string, unknown>;

  const candidate = {
    basics: {
      name: str(basics.name).trim(),
      email: str(basics.email).trim(),
      phone: str(basics.phone).trim(),
      location: str(basics.location).trim(),
      links: Array.isArray(basics.links)
        ? basics.links.map(str).map((l) => l.trim()).filter(Boolean)
        : [],
    },
    summary: str(raw.summary).trim(),
    skills: dedupeIds(skills),
    experience: dedupeIds(
      arr(raw.experience).map((e) => ({
        id: ensureId("ex", str(e.id)),
        company: str(e.company).trim(),
        title: str(e.title).trim(),
        start: str(e.start).trim(),
        end: str(e.end).trim(),
        bullets: bullets(e.bullets, "b"),
      })),
    ),
    projects: dedupeIds(
      arr(raw.projects).map((p) => ({
        id: ensureId("pr", str(p.id)),
        name: str(p.name).trim(),
        bullets: bullets(p.bullets, "b"),
      })),
    ),
    education: dedupeIds(
      arr(raw.education).map((e) => ({
        id: ensureId("ed", str(e.id)),
        institution: str(e.institution ?? e.school).trim(),
        degree: str(e.degree).trim(),
        start: str(e.start).trim(),
        end: str(e.end).trim(),
        detail: str(e.detail).trim(),
      })),
    ),
    certs: dedupeIds(
      arr(raw.certs).map((c) => ({
        id: ensureId("ce", str(c.id)),
        name: str(c.name).trim(),
        issuer: str(c.issuer).trim(),
        year: str(c.year).trim(),
      })),
    ),
  };
  return masterProfileSchema.parse(candidate);
}

/** Every id that a tailored bullet may legally cite as `source_id`. */
export function collectBulletSources(
  profile: MasterProfile,
): Map<string, { text: string; owner: string }> {
  const map = new Map<string, { text: string; owner: string }>();
  for (const e of profile.experience) for (const b of e.bullets) map.set(b.id, { text: b.text, owner: e.id });
  for (const p of profile.projects) for (const b of p.bullets) map.set(b.id, { text: b.text, owner: p.id });
  return map;
}

// ── Tailored profile (output of the Sonnet tailor, SPEC §7) ─────────────────

export const tailoredBulletSchema = z.object({
  source_id: z.string().min(1),
  text: z.string().min(1),
});

export const tailoredProfileSchema = z.object({
  summary: z.string(),
  /** Skill source ids ordered by relevance to the role. */
  skills: z.array(z.object({ source_id: z.string().min(1) })),
  experience: z.array(
    z.object({ source_id: z.string().min(1), bullets: z.array(tailoredBulletSchema) }),
  ),
  projects: z.array(
    z.object({ source_id: z.string().min(1), bullets: z.array(tailoredBulletSchema) }),
  ),
});

export type TailoredProfile = z.infer<typeof tailoredProfileSchema>;
export type TailoredBullet = z.infer<typeof tailoredBulletSchema>;

// ── Requirements (output of the JD extractor, SPEC §6.2) ────────────────────

export const requirementItemSchema = z.object({
  skill_slug: z.string().min(1),
  evidence: z.string(),
});

export const requirementsSchema = z.object({
  must_have: z.array(requirementItemSchema),
  nice_to_have: z.array(requirementItemSchema),
  seniority: z.string(),
  keywords: z.array(z.string()),
  role_family: z.string(),
});

export type Requirements = z.infer<typeof requirementsSchema>;
export type RequirementItem = z.infer<typeof requirementItemSchema>;
