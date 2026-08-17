/**
 * Deterministic fit score (SPEC §6.2):
 *   fit = 70 × (matched must-haves / total must-haves) + 30 × (matched nice-to-haves / total)
 * "Deterministic, not vibes": pure slug comparison between the extracted
 * requirements and the master profile skills. Stored alongside the score so
 * the UI can always show the breakdown and gap list, never a bare number.
 */
import { skillSlugs, slugify, type MasterProfile, type Requirements } from "./profile";

export type FitResult = {
  score: number | null;
  mustHave: { matched: number; total: number };
  niceToHave: { matched: number; total: number };
  matchedMust: string[];
  matchedNice: string[];
  /** Unmatched must-haves first, then unmatched nice-to-haves. */
  gaps: string[];
  computedAt: string;
};

const MUST_WEIGHT = 70;
const NICE_WEIGHT = 30;

function uniqueSlugs(items: { skill_slug: string }[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const s = slugify(it.skill_slug);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export function profileSlugSet(profile: MasterProfile): Set<string> {
  const set = new Set<string>();
  for (const skill of profile.skills) for (const s of skillSlugs(skill)) set.add(s);
  return set;
}

export function computeFit(profile: MasterProfile, requirements: Requirements): FitResult {
  const have = profileSlugSet(profile);
  const must = uniqueSlugs(requirements.must_have);
  const nice = uniqueSlugs(requirements.nice_to_have);

  const matchedMust = must.filter((s) => have.has(s));
  const matchedNice = nice.filter((s) => have.has(s));
  const missingMust = must.filter((s) => !have.has(s));
  const missingNice = nice.filter((s) => !have.has(s));

  let score: number | null;
  if (must.length === 0 && nice.length === 0) {
    score = null;
  } else {
    const mustRatio = must.length ? matchedMust.length / must.length : 1;
    const niceRatio = nice.length ? matchedNice.length / nice.length : 1;
    score = Math.round(MUST_WEIGHT * mustRatio + NICE_WEIGHT * niceRatio);
  }

  return {
    score,
    mustHave: { matched: matchedMust.length, total: must.length },
    niceToHave: { matched: matchedNice.length, total: nice.length },
    matchedMust,
    matchedNice,
    gaps: [...missingMust, ...missingNice],
    computedAt: new Date().toISOString(),
  };
}

/** Parse the stored fit_json column defensively. */
export function parseFitJson(json: string | null | undefined): FitResult | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Partial<FitResult>;
    if (typeof v !== "object" || v === null || !("gaps" in v)) return null;
    return {
      score: typeof v.score === "number" ? v.score : null,
      mustHave: v.mustHave ?? { matched: 0, total: 0 },
      niceToHave: v.niceToHave ?? { matched: 0, total: 0 },
      matchedMust: v.matchedMust ?? [],
      matchedNice: v.matchedNice ?? [],
      gaps: Array.isArray(v.gaps) ? v.gaps : [],
      computedAt: v.computedAt ?? "",
    };
  } catch {
    return null;
  }
}
