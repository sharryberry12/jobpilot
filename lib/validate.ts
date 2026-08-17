/**
 * Tailoring validator (SPEC §6.2 / §7, hard rule 3): a tailored resume may
 * rephrase and reorder, never invent. Enforces
 *  - every source_id exists in the master profile (and belongs to the entry it is listed under),
 *  - no named technology appears in a bullet that is absent from its source bullet,
 *  - no number/metric appears that is absent from its source bullet,
 *  - the summary names no technology absent from the whole profile.
 * Failures are surfaced, never bypassed.
 */
import { collectBulletSources, type MasterProfile, type TailoredProfile } from "./profile";
import { TECH_DICTIONARY, GENERIC_ACRONYMS } from "./techDictionary";

export type ValidationCode =
  | "unknown_source"
  | "wrong_owner"
  | "duplicate_source"
  | "added_technology"
  | "added_metric";

export type ValidationError = {
  path: string;
  code: ValidationCode;
  message: string;
  detail?: string;
};

export type ValidationResult = { ok: boolean; errors: ValidationError[] };

const TOKEN_RE = /\.?[A-Za-z][A-Za-z0-9+#.]*[A-Za-z0-9+#]|[A-Za-z]/g;
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

const tokenKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9+#]/g, "");

function tokens(text: string): string[] {
  return (text.match(TOKEN_RE) ?? []).map((t) => t.replace(/\.+$/, "")).filter(Boolean);
}

function looksLikeTechnology(token: string): boolean {
  const lower = token.toLowerCase();
  if (GENERIC_ACRONYMS.has(lower)) return false;
  if (TECH_DICTIONARY.has(lower) || TECH_DICTIONARY.has(tokenKey(token))) return true;
  if (/^[A-Z][A-Z0-9]{1,9}$/.test(token)) return true; // AWS, SQL, GCP, K8S
  if (/^[A-Za-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(token)) return true; // PostgreSQL, TypeScript
  if (/^[A-Za-z]+\d+[A-Za-z0-9]*$/.test(token)) return true; // S3, EC2, Vue3
  if (/[.+#]/.test(token) && token.length > 1) return true; // Node.js, C++, C#, .NET
  return false;
}

/** Technology-like tokens in `candidate` that do not occur anywhere in `source`. Lowercased. */
export function addedTechnologies(source: string, candidate: string): string[] {
  const sourceKeys = new Set(tokens(source).map(tokenKey));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens(candidate)) {
    const key = tokenKey(t);
    if (!key || sourceKeys.has(key) || seen.has(key)) continue;
    if (looksLikeTechnology(t)) {
      seen.add(key);
      out.push(t.toLowerCase());
    }
  }
  return out;
}

const numberKey = (n: string) => n.replace(/,/g, "").replace(/\.0+$/, "");

/** Numbers in `candidate` that do not occur in `source`. */
export function addedMetrics(source: string, candidate: string): string[] {
  const sourceNums = new Set((source.match(NUMBER_RE) ?? []).map(numberKey));
  const out: string[] = [];
  for (const n of candidate.match(NUMBER_RE) ?? []) {
    const key = numberKey(n);
    if (!sourceNums.has(key) && !out.includes(n)) out.push(n);
  }
  return out;
}

function profileText(profile: MasterProfile): string {
  const parts: string[] = [profile.summary];
  for (const s of profile.skills) parts.push(s.name, s.level);
  for (const e of profile.experience) parts.push(e.company, e.title, ...e.bullets.map((b) => b.text));
  for (const p of profile.projects) parts.push(p.name, ...p.bullets.map((b) => b.text));
  for (const ed of profile.education) parts.push(ed.institution, ed.degree, ed.detail);
  for (const c of profile.certs) parts.push(c.name, c.issuer);
  return parts.join("\n");
}

export function validateTailored(master: MasterProfile, tailored: TailoredProfile): ValidationResult {
  const errors: ValidationError[] = [];
  const bulletSources = collectBulletSources(master);
  const skillIds = new Set(master.skills.map((s) => s.id));
  const experienceIds = new Set(master.experience.map((e) => e.id));
  const projectIds = new Set(master.projects.map((p) => p.id));
  const seenBullets = new Set<string>();

  const push = (path: string, code: ValidationCode, message: string, detail?: string) =>
    errors.push({ path, code, message, detail });

  // Summary: may only name technologies that exist somewhere in the profile.
  const summaryTech = addedTechnologies(profileText(master), tailored.summary);
  if (summaryTech.length > 0) {
    push("summary", "added_technology", "Summary names technologies not present in the master profile", summaryTech.join(", "));
  }

  tailored.skills.forEach((s, i) => {
    if (!skillIds.has(s.source_id)) {
      push(`skills[${i}]`, "unknown_source", `Unknown skill source_id "${s.source_id}"`);
    }
  });

  const checkSection = (
    section: "experience" | "projects",
    entries: TailoredProfile["experience"],
    validOwners: Set<string>,
  ) => {
    entries.forEach((entry, i) => {
      const base = `${section}[${i}]`;
      if (!validOwners.has(entry.source_id)) {
        push(base, "unknown_source", `Unknown ${section} source_id "${entry.source_id}"`);
      }
      entry.bullets.forEach((b, j) => {
        const path = `${base}.bullets[${j}]`;
        const src = bulletSources.get(b.source_id);
        if (!src) {
          push(path, "unknown_source", `Bullet cites unknown source_id "${b.source_id}"`, b.text);
          return;
        }
        if (seenBullets.has(b.source_id)) {
          push(path, "duplicate_source", `Bullet source "${b.source_id}" is used more than once`);
        }
        seenBullets.add(b.source_id);
        if (src.owner !== entry.source_id) {
          push(path, "wrong_owner", `Bullet "${b.source_id}" belongs to ${src.owner}, not ${entry.source_id}`);
        }
        const tech = addedTechnologies(src.text, b.text);
        if (tech.length > 0) {
          push(path, "added_technology", "Bullet adds technologies absent from its source", tech.join(", "));
        }
        const metrics = addedMetrics(src.text, b.text);
        if (metrics.length > 0) {
          push(path, "added_metric", "Bullet adds numbers/metrics absent from its source", metrics.join(", "));
        }
      });
    });
  };

  checkSection("experience", tailored.experience, experienceIds);
  checkSection("projects", tailored.projects, projectIds);

  return { ok: errors.length === 0, errors };
}
