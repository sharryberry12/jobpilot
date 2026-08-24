import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./db";
import { emails } from "./db/schema";
import {
  backfillLeads,
  countNewLeads,
  extractLeadsFromEmail,
  getLead,
  listLeads,
  markLeadApplied,
  parseLinkedInJobs,
  setLeadStatus,
} from "./leads";

const TRACK =
  "?trackingId=abc%3D%3D&refId=xyz&lipi=urn%3Ali%3Apage%3Aemail_email_job_alert_digest_01&trk=eml-email_job_alert_digest_01-primary_job_list-0";

/** Shape of jobalerts-noreply@linkedin.com digests (header + cards + footer). */
const ALERT_BODY = `Your job alert for Software Engineer in Berwick

New jobs match your preferences.

Software Engineer
affix
Cremorne, VIC

This company is actively hiring
View job: https://www.linkedin.com/comm/jobs/view/4454244923/${TRACK}

---------------------------------------------------------

Embedded Software Engineer
Invetech
Mount Waverley, VIC

2 connections
Apply with resume & profile
View job: https://www.linkedin.com/comm/jobs/view/4454248203/${TRACK}

---------------------------------------------------------

Software Engineer - 12 MFTC
affix
Cremorne, VIC

This company is actively hiring
View job: https://www.linkedin.com/comm/jobs/view/4454245943/${TRACK}

---------------------------------------------------------

See all jobs: https://www.linkedin.com/comm/jobs/search/?x=1

----------------------------------------

This email was intended for Someone.
Unsubscribe: https://www.linkedin.com/comm/psettings/email-unsubscribe?x=1
`;

/** Shape of jobs-noreply@linkedin.com "recommendations" (section headers inside blocks). */
const RECO_BODY = `Expand your search

Recommendations based on your activity.

Aerospace jobs
https://www.linkedin.com/comm/jobs/search/?keywords=aerospace

Software Engineers - Space Technology 🚀
TheDriveGroup
Australia
Apply with resume & profile
View job: https://www.linkedin.com/comm/jobs/view/4450000001/${TRACK}

---------------------------------------------------------

Software Engineer
BAE Systems Australia
Richmond
View job: https://www.linkedin.com/comm/jobs/view/4450000002/${TRACK}

---------------------------------------------------------

View all jobs: https://www.linkedin.com/comm/jobs/search/?x=2

Robotics jobs
https://www.linkedin.com/comm/jobs/search/?keywords=robotics

Senior Robotics Software Engineer
Ornata
Greater Melbourne Area
View job: https://www.linkedin.com/comm/jobs/view/4450000003/${TRACK}

---------------------------------------------------------
`;

describe("parseLinkedInJobs", () => {
  it("extracts title/company/location/id from a job-alert digest and drops the extras", () => {
    const jobs = parseLinkedInJobs(ALERT_BODY);
    expect(jobs).toEqual([
      {
        externalId: "4454244923",
        title: "Software Engineer",
        company: "affix",
        location: "Cremorne, VIC",
        url: "https://www.linkedin.com/jobs/view/4454244923/",
      },
      {
        externalId: "4454248203",
        title: "Embedded Software Engineer",
        company: "Invetech",
        location: "Mount Waverley, VIC",
        url: "https://www.linkedin.com/jobs/view/4454248203/",
      },
      {
        externalId: "4454245943",
        title: "Software Engineer - 12 MFTC",
        company: "affix",
        location: "Cremorne, VIC",
        url: "https://www.linkedin.com/jobs/view/4454245943/",
      },
    ]);
  });

  it("handles recommendation digests where section headers share a block with a card", () => {
    const jobs = parseLinkedInJobs(RECO_BODY);
    expect(jobs.map((j) => [j.title, j.company, j.location])).toEqual([
      ["Software Engineers - Space Technology 🚀", "TheDriveGroup", "Australia"],
      ["Software Engineer", "BAE Systems Australia", "Richmond"],
      ["Senior Robotics Software Engineer", "Ornata", "Greater Melbourne Area"],
    ]);
  });

  it("dedupes the same job id within one email and ignores non-job linkedin links", () => {
    const body = `${ALERT_BODY}\n${ALERT_BODY}`;
    expect(parseLinkedInJobs(body)).toHaveLength(3);
  });

  it("returns [] for emails without job cards", () => {
    expect(parseLinkedInJobs("You have 2 new invitations\nView invitations: https://www.linkedin.com/comm/x")).toEqual(
      [],
    );
    expect(parseLinkedInJobs("")).toEqual([]);
  });

  it("keeps a title that mentions pay, drops company-alumni lines, and strips stray HTML in headers", () => {
    const body = `New jobs from your other alerts

<strong class="font-bold" style="font-weight: 600;">Software Engineer</strong> jobs in Melbourne

Development Team Lead ($180k-$220k) at Kyckr
Jack & Jill
Australia
View job: https://www.linkedin.com/comm/jobs/view/11/?x=1

---------------------------------------------------------

Engineer - Power Systems Software
Australian Energy Market Operator (AEMO)
Greater Melbourne Area

3 company alumni
View job: https://www.linkedin.com/comm/jobs/view/12/?x=1

---------------------------------------------------------

Cloud Engineer
Amazon Web Services (AWS)
Melbourne, VIC

1 company alum
View job: https://www.linkedin.com/comm/jobs/view/13/?x=1
`;
    expect(parseLinkedInJobs(body).map((j) => [j.title, j.company, j.location])).toEqual([
      ["Development Team Lead ($180k-$220k) at Kyckr", "Jack & Jill", "Australia"],
      ["Engineer - Power Systems Software", "Australian Energy Market Operator (AEMO)", "Greater Melbourne Area"],
      ["Cloud Engineer", "Amazon Web Services (AWS)", "Melbourne, VIC"],
    ]);
  });

  it("skips salary / applicant-count lines that LinkedIn wedges between location and the link", () => {
    const body = `Data Engineer
Acme Corp
Sydney, NSW
A$120,000.00/yr - A$140,000.00/yr
14 applicants
Be an early applicant
View job: https://www.linkedin.com/comm/jobs/view/1/?x=1
`;
    expect(parseLinkedInJobs(body)).toEqual([
      { externalId: "1", title: "Data Engineer", company: "Acme Corp", location: "Sydney, NSW", url: "https://www.linkedin.com/jobs/view/1/" },
    ]);
  });
});

describe("leads store", () => {
  let db: Db;
  const alertEmail = {
    id: "msg_alert_1",
    threadId: null,
    fromAddr: "LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>",
    subject: "affix and more hiring now",
    receivedAt: "2026-08-10T01:00:00.000Z",
    bodyText: ALERT_BODY,
  };

  beforeEach(() => {
    db = openDatabase(":memory:").db;
  });

  it("inserts one lead per job card and is idempotent across re-runs", () => {
    const first = extractLeadsFromEmail(alertEmail, db);
    expect(first).toEqual({ found: 3, inserted: 3 });
    const second = extractLeadsFromEmail(alertEmail, db);
    expect(second).toEqual({ found: 3, inserted: 0 });
    expect(listLeads({ status: "new" }, db)).toHaveLength(3);
    expect(countNewLeads(db)).toBe(3);
  });

  it("tracks first/last seen across alerts without touching a decided status", () => {
    extractLeadsFromEmail(alertEmail, db);
    const lead = listLeads({ status: "new" }, db).find((l) => l.externalId === "4454248203")!;
    setLeadStatus(lead.id, "dismissed", db);

    extractLeadsFromEmail({ ...alertEmail, id: "msg_alert_2", receivedAt: "2026-08-12T01:00:00.000Z" }, db);
    const again = getLead(lead.id, db)!;
    expect(again.status).toBe("dismissed");
    expect(again.firstSeenAt).toBe("2026-08-10T01:00:00.000Z");
    expect(again.lastSeenAt).toBe("2026-08-12T01:00:00.000Z");
    expect(again.emailId).toBe("msg_alert_1");
    expect(countNewLeads(db)).toBe(2);
  });

  it("re-parsing refreshes display fields on existing rows but never their status", () => {
    extractLeadsFromEmail(alertEmail, db);
    const lead = listLeads({ status: "new" }, db).find((l) => l.externalId === "4454244923")!;
    setLeadStatus(lead.id, "dismissed", db);
    const fixedBody = ALERT_BODY.replace("Software Engineer\naffix\nCremorne, VIC", "Software Engineer II\naffix\nCremorne, VIC");
    extractLeadsFromEmail({ ...alertEmail, id: "msg_alert_3", bodyText: fixedBody }, db);
    const again = getLead(lead.id, db)!;
    expect(again.title).toBe("Software Engineer II");
    expect(again.status).toBe("dismissed");
  });

  it("markLeadApplied links the application and moves the lead out of `new`", () => {
    extractLeadsFromEmail(alertEmail, db);
    const lead = listLeads({ status: "new" }, db)[0];
    db.run(
      "insert into applications (id, company, role_title, jd_text, applied_at, status, created_at, updated_at) values ('app_x','affix','SE','jd','2026-08-11','applied','2026-08-11','2026-08-11')",
    );
    markLeadApplied(lead.id, "app_x", db);
    const updated = getLead(lead.id, db)!;
    expect(updated.status).toBe("applied");
    expect(updated.applicationId).toBe("app_x");
    expect(listLeads({ status: "applied" }, db).map((l) => l.id)).toEqual([lead.id]);
  });

  it("backfillLeads scans stored emails oldest-first and only touches job digests", () => {
    db.insert(emails)
      .values([
        { id: "e1", fromAddr: alertEmail.fromAddr, subject: "s", bodyText: ALERT_BODY, receivedAt: "2026-08-01T00:00:00.000Z" },
        { id: "e2", fromAddr: "LinkedIn <jobs-noreply@linkedin.com>", subject: "s", bodyText: RECO_BODY, receivedAt: "2026-08-02T00:00:00.000Z" },
        { id: "e3", fromAddr: "someone@example.com", subject: "hi", bodyText: "no jobs here", receivedAt: "2026-08-03T00:00:00.000Z" },
      ])
      .run();
    const summary = backfillLeads(db);
    expect(summary).toEqual({ emailsScanned: 2, found: 6, inserted: 6 });
    expect(backfillLeads(db)).toEqual({ emailsScanned: 2, found: 6, inserted: 0 });
    // newest sighting first
    expect(listLeads({ status: "new" }, db)[0].externalId).toBe("4450000001");
  });
});
