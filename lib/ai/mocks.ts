/**
 * Deterministic stand-ins for the AI calls, used only when JOBPILOT_MOCK_AI=1.
 * They are intentionally simple: enough to exercise every screen offline.
 */
import { TECH_DICTIONARY } from "../techDictionary";
import type { MasterProfile, Requirements, TailoredProfile } from "../profile";

/** Crude resume-text → draft: first line = name, tech words = skills, "•/-" lines = bullets. */
export function mockResumeDraft(rawText: string) {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const name = lines[0] ?? "";
  const email = rawText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "";
  const words = new Set<string>();
  for (const w of rawText.toLowerCase().match(/[a-z][a-z0-9+#.]*/g) ?? []) if (TECH_DICTIONARY.has(w)) words.add(w);
  const bullets = lines.filter((l) => /^[•\-*–]\s+/.test(l)).map((l) => l.replace(/^[•\-*–]\s+/, ""));
  return {
    basics: { name, email, phone: "", location: "", links: [] as string[] },
    summary: lines.slice(1, 3).join(" ").slice(0, 300),
    skills: [...words].slice(0, 25).map((w) => ({ name: w, level: "" })),
    experience: bullets.length
      ? [{ company: "Parsed from upload", title: "See bullets", start: "", end: "", bullets: bullets.slice(0, 12) }]
      : [],
    projects: [] as { name: string; bullets: string[] }[],
    education: [] as { institution: string; degree: string; start: string; end: string; detail: string }[],
    certs: [] as { name: string; issuer: string; year: string }[],
  };
}

/** Requirements from a JD: dictionary tech words; "nice/bonus/preferred" lines → nice_to_have. */
export function mockRequirements(jdText: string): Requirements {
  const lower = jdText.toLowerCase();
  const niceStart = lower.search(/nice to have|nice-to-have|bonus|preferred|desirable/);
  const mustPart = niceStart >= 0 ? lower.slice(0, niceStart) : lower;
  const nicePart = niceStart >= 0 ? lower.slice(niceStart) : "";
  const pick = (text: string) => {
    const seen = new Set<string>();
    const out: { skill_slug: string; evidence: string }[] = [];
    for (const w of text.match(/[a-z][a-z0-9+#.]*/g) ?? []) {
      const slug = w.replace(/\.js$/, "js").replace(/[^a-z0-9]+/g, "-");
      if (TECH_DICTIONARY.has(w) && !seen.has(slug)) {
        seen.add(slug);
        out.push({ skill_slug: slug, evidence: w });
      }
    }
    return out;
  };
  const must = pick(mustPart);
  const nice = pick(nicePart).filter((n) => !must.some((m) => m.skill_slug === n.skill_slug));
  return {
    must_have: must,
    nice_to_have: nice,
    seniority: /senior|lead/.test(lower) ? "senior" : /junior|graduate/.test(lower) ? "junior" : "mid",
    keywords: [...new Set([...must, ...nice].map((x) => x.skill_slug))].slice(0, 12),
    role_family: /front|react|ui/.test(lower) ? "frontend" : /data/.test(lower) ? "data-engineering" : /devops|kubernetes/.test(lower) ? "devops" : "backend",
  };
}

/** Identity tailor: same bullets verbatim, skills in profile order → always passes validation. */
export function mockTailored(profile: MasterProfile, requirements: Requirements): TailoredProfile {
  const wanted = new Set([...requirements.must_have, ...requirements.nice_to_have].map((r) => r.skill_slug));
  const score = (name: string) => (wanted.has(name.toLowerCase().replace(/[^a-z0-9]+/g, "-")) ? 0 : 1);
  return {
    summary: profile.summary || `Candidate for ${requirements.role_family} roles.`,
    skills: [...profile.skills].sort((a, b) => score(a.name) - score(b.name)).map((s) => ({ source_id: s.id })),
    experience: profile.experience.map((e) => ({
      source_id: e.id,
      bullets: e.bullets.map((b) => ({ source_id: b.id, text: b.text })),
    })),
    projects: profile.projects.map((p) => ({
      source_id: p.id,
      bullets: p.bullets.map((b) => ({ source_id: b.id, text: b.text })),
    })),
  };
}
