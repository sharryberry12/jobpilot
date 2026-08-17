import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./db";
import {
  createApplication,
  deleteApplication,
  getApplication,
  getTimeline,
  listActiveApplications,
  transitionApplication,
  updateApplication,
} from "./applications";

let db: Db;

const sample = {
  company: "Acme",
  roleTitle: "Frontend Engineer",
  jdText: "Build things with React and TypeScript.",
  sourceUrl: "https://acme.example/jobs/1",
  location: "Remote",
  appliedAt: "2026-08-01",
};

beforeEach(() => {
  db = openDatabase(":memory:").db;
});

describe("createApplication", () => {
  it("creates in `applied` and writes an initial status_event", () => {
    const app = createApplication(sample, db);
    expect(app.id).toMatch(/^app_[0-9a-z]{12}$/);
    expect(app.status).toBe("applied");
    expect(app.appliedAt).toBe(new Date(2026, 7, 1).toISOString()); // local midnight

    const timeline = getTimeline(app.id, db);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ fromStatus: null, toStatus: "applied", source: "manual" });
  });

  it("trims whitespace and nulls empty optionals", () => {
    const app = createApplication({ ...sample, company: "  Acme ", sourceUrl: "  ", location: "" }, db);
    expect(app.company).toBe("Acme");
    expect(app.sourceUrl).toBeNull();
    expect(app.location).toBeNull();
  });
});

describe("transitionApplication", () => {
  it("performs a legal forward move and appends an event", () => {
    const app = createApplication(sample, db);
    const result = transitionApplication(app.id, "screening", "manual", {}, db);
    expect(result.ok).toBe(true);
    expect(getApplication(app.id, db)?.status).toBe("screening");
    const timeline = getTimeline(app.id, db);
    expect(timeline).toHaveLength(2);
    expect(timeline[1]).toMatchObject({ fromStatus: "applied", toStatus: "screening", source: "manual" });
  });

  it("refuses an illegal move with a reason and writes nothing", () => {
    const app = createApplication(sample, db);
    transitionApplication(app.id, "interview", "manual", {}, db);
    transitionApplication(app.id, "offer", "manual", {}, db);
    const before = getTimeline(app.id, db).length;

    const result = transitionApplication(app.id, "applied", "manual", {}, db);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/offer/i);
    expect(getApplication(app.id, db)?.status).toBe("offer");
    expect(getTimeline(app.id, db)).toHaveLength(before);
  });

  it("refuses email-sourced withdrawn", () => {
    const app = createApplication(sample, db);
    const result = transitionApplication(app.id, "withdrawn", "email", {}, db);
    expect(result.ok).toBe(false);
    expect(getApplication(app.id, db)?.status).toBe("applied");
  });

  it("increments the interview round counter in the event note", () => {
    const app = createApplication(sample, db);
    transitionApplication(app.id, "interview", "manual", {}, db);
    const r2 = transitionApplication(app.id, "interview", "manual", {}, db);
    const r3 = transitionApplication(app.id, "interview", "manual", { note: "onsite" }, db);
    expect(r2.ok && r2.event.note).toBe("Interview round 2");
    expect(r3.ok && r3.event.note).toBe("Interview round 3 — onsite");
  });

  it("clears the ghosted flag on any new event", () => {
    const app = createApplication(sample, db);
    db.run(`update applications set ghosted = 1 where id = '${app.id}'`);
    expect(getApplication(app.id, db)?.ghosted).toBe(true);
    transitionApplication(app.id, "screening", "email", { emailId: "msg_1" }, db);
    expect(getApplication(app.id, db)?.ghosted).toBe(false);
  });

  it("returns not-found for unknown ids", () => {
    const result = transitionApplication("app_nope", "screening", "manual", {}, db);
    expect(result).toMatchObject({ ok: false, application: null });
  });
});

describe("update / delete / list", () => {
  it("updates fields without touching status", () => {
    const app = createApplication(sample, db);
    transitionApplication(app.id, "screening", "manual", {}, db);
    const updated = updateApplication(app.id, { location: "Sydney", sourceUrl: "" }, db);
    expect(updated?.location).toBe("Sydney");
    expect(updated?.sourceUrl).toBeNull();
    expect(updated?.status).toBe("screening");
  });

  it("delete cascades to status_events", () => {
    const app = createApplication(sample, db);
    transitionApplication(app.id, "screening", "manual", {}, db);
    expect(deleteApplication(app.id, db)).toBe(true);
    expect(getApplication(app.id, db)).toBeNull();
    expect(getTimeline(app.id, db)).toHaveLength(0);
    expect(deleteApplication(app.id, db)).toBe(false);
  });

  it("listActiveApplications excludes terminal states", () => {
    const a = createApplication(sample, db);
    const b = createApplication({ ...sample, company: "Beta" }, db);
    transitionApplication(b.id, "rejected", "email", {}, db);
    const active = listActiveApplications(db).map((x) => x.id);
    expect(active).toContain(a.id);
    expect(active).not.toContain(b.id);
  });
});
