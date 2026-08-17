import { describe, expect, it } from "vitest";
import { computeFit } from "./fit";
import { normaliseProfile, type Requirements } from "./profile";

const profile = normaliseProfile({
  skills: [
    { id: "sk_react", name: "React", level: "production" },
    { id: "sk_typescript", name: "TypeScript" },
    { name: "Node.js" },
    { name: "PostgreSQL" },
    { name: "Stakeholder management" },
  ],
});

const req = (must: string[], nice: string[]): Requirements => ({
  must_have: must.map((s) => ({ skill_slug: s, evidence: "" })),
  nice_to_have: nice.map((s) => ({ skill_slug: s, evidence: "" })),
  seniority: "mid",
  keywords: [],
  role_family: "frontend",
});

describe("computeFit", () => {
  it("applies 70/30 weighting: fit = 70*(must matched/total) + 30*(nice matched/total)", () => {
    // must: react ✓, typescript ✓, graphql ✗, docker ✗ → 2/4 ; nice: postgresql ✓, redis ✗ → 1/2
    const fit = computeFit(profile, req(["react", "typescript", "graphql", "docker"], ["postgresql", "redis"]));
    expect(fit.score).toBe(Math.round(70 * 0.5 + 30 * 0.5)); // 50
    expect(fit.mustHave).toEqual({ matched: 2, total: 4 });
    expect(fit.niceToHave).toEqual({ matched: 1, total: 2 });
  });

  it("lists unmatched must-haves first, then unmatched nice-to-haves", () => {
    const fit = computeFit(profile, req(["graphql", "react", "docker"], ["redis", "postgresql"]));
    expect(fit.gaps).toEqual(["graphql", "docker", "redis"]);
    expect(fit.gaps.slice(0, 2)).toEqual(["graphql", "docker"]);
  });

  it("matches slugs derived from skill names (node.js → nodejs, stakeholder management)", () => {
    const fit = computeFit(profile, req(["nodejs", "stakeholder-management"], []));
    expect(fit.mustHave).toEqual({ matched: 2, total: 2 });
    expect(fit.score).toBe(100);
  });

  it("matches slugs derived from ids (sk_typescript → typescript)", () => {
    const p = normaliseProfile({ skills: [{ id: "sk_typescript", name: "TS" }] });
    expect(computeFit(p, req(["typescript"], [])).mustHave.matched).toBe(1);
  });

  it("is case/format insensitive on the requirement side", () => {
    const fit = computeFit(profile, req(["React", "Type Script"], []));
    expect(fit.mustHave.matched).toBe(1); // "type-script" != "typescript" (extractor must canonicalise)
    expect(computeFit(profile, req(["type_script"], [])).mustHave.matched).toBe(0);
    expect(computeFit(profile, req(["REACT"], [])).mustHave.matched).toBe(1);
  });

  it("empty categories count as fully satisfied; both empty → no score", () => {
    expect(computeFit(profile, req(["react"], [])).score).toBe(100);
    expect(computeFit(profile, req([], ["redis"])).score).toBe(70);
    expect(computeFit(profile, req([], [])).score).toBeNull();
  });

  it("dedupes repeated slugs in the requirements", () => {
    const fit = computeFit(profile, req(["react", "react", "graphql"], []));
    expect(fit.mustHave).toEqual({ matched: 1, total: 2 });
  });

  it("returns matched lists for the breakdown popover", () => {
    const fit = computeFit(profile, req(["react", "graphql"], ["postgresql"]));
    expect(fit.matchedMust).toEqual(["react"]);
    expect(fit.matchedNice).toEqual(["postgresql"]);
  });
});
