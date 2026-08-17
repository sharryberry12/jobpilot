/** Loader for fixtures/emails/*.json — used by the eval script and `npm run sync -- --fixtures`. */
import fs from "node:fs";
import path from "node:path";
import type { EmailEvent } from "./ai/classify";
import type { FetchedEmail } from "./gmail";
import type { Status } from "./stateMachine";
import type { EmailSource } from "./sync";

export type EmailFixture = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  body: string;
  expected: { prefilter: boolean; application: string | null; event: EmailEvent };
};

export type FixtureApplication = {
  id: string;
  company: string;
  roleTitle: string;
  status: Status;
  appliedAt: string;
  companyDomains?: string;
};

const DIR = path.join(process.cwd(), "fixtures", "emails");

export function loadEmailFixtures(): EmailFixture[] {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as EmailFixture);
}

export function loadFixtureApplications(): FixtureApplication[] {
  return JSON.parse(fs.readFileSync(path.join(DIR, "_applications.json"), "utf8")) as FixtureApplication[];
}

export function fixtureToEmail(fx: EmailFixture, idPrefix = ""): FetchedEmail {
  return {
    id: `${idPrefix}${fx.id}`,
    threadId: fx.threadId,
    fromAddr: fx.from,
    subject: fx.subject,
    receivedAt: fx.date,
    bodyText: fx.body,
  };
}

/** A mail source that serves the fixtures instead of Gmail (ids prefixed per run so re-ingest is possible). */
export function fixtureSource(idPrefix = ""): EmailSource {
  const fixtures = loadEmailFixtures();
  return {
    name: "fixtures",
    list: async () => ({ ids: fixtures.map((f) => `${idPrefix}${f.id}`), mode: "full", historyId: null }),
    fetch: async (id) => {
      const fx = fixtures.find((f) => `${idPrefix}${f.id}` === id);
      return fx ? fixtureToEmail(fx, idPrefix) : null;
    },
  };
}
