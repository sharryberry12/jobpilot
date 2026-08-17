import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normaliseProfile, tailoredProfileSchema } from "./profile";
import { addedTechnologies, validateTailored } from "./validate";

const load = (name: string) => JSON.parse(readFileSync(`fixtures/resume/${name}`, "utf8"));
const master = normaliseProfile(load("master-profile.json"));

describe("validateTailored", () => {
  it("accepts a faithful rephrase/reorder", () => {
    const tailored = tailoredProfileSchema.parse(load("tailored-valid.json"));
    const result = validateTailored(master, tailored);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects the fabricated fixture: unknown source_id, added technology, changed metric", () => {
    const tailored = tailoredProfileSchema.parse(load("tailored-fabricated.json"));
    const result = validateTailored(master, tailored);
    expect(result.ok).toBe(false);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain("unknown_source");
    expect(codes).toContain("added_technology");
    expect(codes).toContain("added_metric");
    const tech = result.errors.find((e) => e.code === "added_technology");
    expect(tech?.detail).toMatch(/graphql/i);
    const metric = result.errors.find((e) => e.code === "added_metric");
    expect(metric?.detail).toMatch(/65/);
  });

  it("rejects bullets cited under the wrong experience entry", () => {
    const tailored = tailoredProfileSchema.parse({
      summary: "",
      skills: [],
      experience: [{ source_id: "ex_2", bullets: [{ source_id: "b_1", text: "Built the customer dashboard in React and TypeScript, used by 12,000 monthly users." }] }],
      projects: [],
    });
    const result = validateTailored(master, tailored);
    expect(result.errors.some((e) => e.code === "wrong_owner")).toBe(true);
  });

  it("rejects unknown experience/project/skill source ids", () => {
    const tailored = tailoredProfileSchema.parse({
      summary: "",
      skills: [{ source_id: "sk_kubernetes" }],
      experience: [{ source_id: "ex_99", bullets: [] }],
      projects: [{ source_id: "pr_99", bullets: [] }],
    });
    const codes = validateTailored(master, tailored).errors.map((e) => `${e.path}:${e.code}`);
    expect(codes).toContain("skills[0]:unknown_source");
    expect(codes).toContain("experience[0]:unknown_source");
    expect(codes).toContain("projects[0]:unknown_source");
  });

  it("flags a technology invented in the summary that appears nowhere in the profile", () => {
    const tailored = tailoredProfileSchema.parse({
      summary: "Frontend engineer with deep Kubernetes and Terraform expertise.",
      skills: [],
      experience: [],
      projects: [],
    });
    const result = validateTailored(master, tailored);
    const summaryErr = result.errors.find((e) => e.path === "summary");
    expect(summaryErr?.code).toBe("added_technology");
    expect(summaryErr?.detail).toMatch(/kubernetes/i);
  });
});

describe("addedTechnologies", () => {
  it("ignores ordinary capitalised sentence starts and words present in the source", () => {
    expect(addedTechnologies("Built the API in Node.js.", "Delivered the API using Node.js and Express.")).toEqual(["express"]);
    expect(addedTechnologies("Improved throughput.", "Improved overall throughput.")).toEqual([]);
    expect(addedTechnologies("Used React.", "Leveraged React")).toEqual([]);
  });

  it("catches acronyms, dotted names, and dictionary tech words", () => {
    expect(addedTechnologies("Ran reports.", "Ran reports on AWS with Kubernetes and Next.js")).toEqual(
      expect.arrayContaining(["aws", "kubernetes", "next.js"]),
    );
  });
});
