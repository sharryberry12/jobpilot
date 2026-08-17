import { describe, expect, it } from "vitest";
import {
  ACTIVE_STATUSES,
  FORWARD_EDGES,
  PIPELINE_STATUSES,
  STATUSES,
  TERMINAL_STATUSES,
  canTransition,
  isForwardEdge,
  type Source,
  type Status,
} from "./stateMachine";

const SOURCES: Source[] = ["manual", "email", "system"];

/** Every ordered (from, to) pair including from === to. */
const allPairs = (): Array<[Status, Status]> =>
  STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as [Status, Status]));

describe("status vocabulary", () => {
  it("has exactly the eight spec states", () => {
    expect(STATUSES).toEqual([
      "applied",
      "screening",
      "assessment",
      "interview",
      "offer",
      "accepted",
      "rejected",
      "withdrawn",
    ]);
  });

  it("partitions states into active vs terminal", () => {
    expect(ACTIVE_STATUSES).toEqual(["applied", "screening", "assessment", "interview", "offer"]);
    expect(TERMINAL_STATUSES).toEqual(["accepted", "rejected", "withdrawn"]);
    expect(PIPELINE_STATUSES).toEqual(["applied", "screening", "assessment", "interview"]);
  });
});

describe("forward edges (allowed for every source)", () => {
  const expected: Array<[Status, Status]> = [
    ["applied", "screening"],
    ["applied", "assessment"],
    ["applied", "interview"],
    ["screening", "assessment"],
    ["screening", "interview"],
    ["assessment", "interview"],
    ["interview", "interview"],
    ["interview", "offer"],
    ["offer", "accepted"],
  ];

  it("declares exactly the spec's forward edge list", () => {
    expect(FORWARD_EDGES).toEqual(expected);
  });

  it.each(expected)("%s → %s is allowed for manual, email and system", (from, to) => {
    for (const source of SOURCES) {
      expect(isForwardEdge(from, to)).toBe(true);
      expect(canTransition(from, to, source)).toEqual({ ok: true });
    }
  });
});

describe("→ rejected", () => {
  it.each(ACTIVE_STATUSES)("%s → rejected is allowed for every source", (from) => {
    for (const source of SOURCES) {
      expect(canTransition(from, "rejected", source)).toEqual({ ok: true });
    }
  });

  it.each(TERMINAL_STATUSES)("%s → rejected is forbidden (terminal states are final)", (from) => {
    for (const source of SOURCES) {
      expect(canTransition(from, "rejected", source).ok).toBe(false);
    }
  });
});

describe("→ withdrawn (manual only)", () => {
  it.each(ACTIVE_STATUSES)("%s → withdrawn is allowed manually", (from) => {
    expect(canTransition(from, "withdrawn", "manual")).toEqual({ ok: true });
  });

  it.each(ACTIVE_STATUSES)("%s → withdrawn is refused for email and system", (from) => {
    for (const source of ["email", "system"] as const) {
      const result = canTransition(from, "withdrawn", source);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/manual/i);
    }
  });
});

describe("backward moves", () => {
  const backwardPipeline: Array<[Status, Status]> = [
    ["screening", "applied"],
    ["assessment", "applied"],
    ["assessment", "screening"],
    ["interview", "applied"],
    ["interview", "screening"],
    ["interview", "assessment"],
  ];

  it.each(backwardPipeline)("%s → %s is allowed manually (undo a mis-drag)", (from, to) => {
    expect(canTransition(from, to, "manual")).toEqual({ ok: true });
  });

  it.each(backwardPipeline)("%s → %s is refused for email and system", (from, to) => {
    for (const source of ["email", "system"] as const) {
      const result = canTransition(from, to, source);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/manual/i);
    }
  });

  it.each(PIPELINE_STATUSES)("offer → %s is forbidden even manually (spec: offer → applied snaps back)", (to) => {
    for (const source of SOURCES) {
      const result = canTransition("offer", to, source);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBeTruthy();
    }
  });
});

describe("terminal states", () => {
  it.each(TERMINAL_STATUSES)("nothing may leave %s", (from) => {
    for (const to of STATUSES) {
      for (const source of SOURCES) {
        expect(canTransition(from, to, source).ok).toBe(false);
      }
    }
  });
});

describe("same-state moves", () => {
  it("only interview → interview (a new round) is a legal self-transition", () => {
    for (const s of STATUSES) {
      const result = canTransition(s, s, "manual");
      expect(result.ok).toBe(s === "interview");
    }
  });
});

describe("skipping ahead", () => {
  const skips: Array<[Status, Status]> = [
    ["applied", "offer"],
    ["applied", "accepted"],
    ["screening", "offer"],
    ["screening", "accepted"],
    ["assessment", "offer"],
    ["assessment", "accepted"],
    ["interview", "accepted"],
  ];

  it.each(skips)("%s → %s is forbidden for every source", (from, to) => {
    for (const source of SOURCES) {
      expect(canTransition(from, to, source).ok).toBe(false);
    }
  });
});

describe("exhaustive matrix", () => {
  it("every pair is either explicitly legal or returns a human-readable reason", () => {
    for (const [from, to] of allPairs()) {
      for (const source of SOURCES) {
        const result = canTransition(from, to, source);
        if (!result.ok) {
          expect(typeof result.reason).toBe("string");
          expect(result.reason.length).toBeGreaterThan(8);
        }
      }
    }
  });

  it("email may only ever use forward edges or → rejected", () => {
    for (const [from, to] of allPairs()) {
      const result = canTransition(from, to, "email");
      const legalForEmail =
        isForwardEdge(from, to) || (to === "rejected" && ACTIVE_STATUSES.includes(from));
      expect(result.ok).toBe(legalForEmail);
    }
  });

  it("system follows the same restrictions as email", () => {
    for (const [from, to] of allPairs()) {
      expect(canTransition(from, to, "system").ok).toBe(canTransition(from, to, "email").ok);
    }
  });

  it("manual legality = email legality + withdrawn + backward pipeline moves", () => {
    for (const [from, to] of allPairs()) {
      const emailOk = canTransition(from, to, "email").ok;
      const manualOnly =
        (to === "withdrawn" && ACTIVE_STATUSES.includes(from)) ||
        (PIPELINE_STATUSES.includes(from) &&
          PIPELINE_STATUSES.includes(to) &&
          PIPELINE_STATUSES.indexOf(to) < PIPELINE_STATUSES.indexOf(from));
      expect(canTransition(from, to, "manual").ok).toBe(emailOk || manualOnly);
    }
  });
});
