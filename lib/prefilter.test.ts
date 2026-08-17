import { describe, expect, it } from "vitest";
import { ATS_DOMAINS, SUBJECT_KEYWORDS, companyDomainCandidates, prefilter, senderDomain } from "./prefilter";

const active = [
  { id: "app_1", company: "Northwind Analytics", companyDomains: null },
  { id: "app_2", company: "Harbour Health Pty Ltd", companyDomains: "harbourhealth.com.au, hh-careers.io" },
  { id: "app_3", company: "The Kestrel Robotics Company", companyDomains: null },
];

const email = (over: Partial<{ fromAddr: string; subject: string; bodyText: string }>) => ({
  fromAddr: "someone@example.com",
  subject: "Hello",
  bodyText: "Nothing to see here.",
  ...over,
});

describe("senderDomain", () => {
  it("extracts the domain from display-name addresses", () => {
    expect(senderDomain('"Jobs at Acme" <no-reply@mail.acme.com>')).toBe("mail.acme.com");
    expect(senderDomain("no-reply@Greenhouse.io")).toBe("greenhouse.io");
    expect(senderDomain("garbage")).toBe("");
  });
});

describe("companyDomainCandidates", () => {
  it("derives compact + first-word candidates and drops legal suffixes", () => {
    expect(companyDomainCandidates("Harbour Health Pty Ltd")).toEqual(["harbourhealth", "harbour"]);
    expect(companyDomainCandidates("The Kestrel Robotics Company")).toEqual(["kestrelrobotics", "kestrel"]);
    expect(companyDomainCandidates("IBM")).toEqual(["ibm"]);
  });
});

describe("prefilter", () => {
  it("keeps mail from ATS domains (including subdomains)", () => {
    for (const d of ATS_DOMAINS.slice(0, 5)) {
      const r = prefilter(email({ fromAddr: `no-reply@notifications.${d}` }), active);
      expect(r.keep).toBe(true);
      expect(r.reasons[0]).toMatch(/ats/i);
    }
  });

  it("keeps mail from a domain derived from an active company name", () => {
    expect(prefilter(email({ fromAddr: "talent@northwindanalytics.com" }), active).keep).toBe(true);
    expect(prefilter(email({ fromAddr: "hr@mail.northwind.example" }), active).keep).toBe(true);
    expect(prefilter(email({ fromAddr: "hr@kestrel-robotics.com" }), active).keep).toBe(true);
  });

  it("keeps mail from an explicit company_domains override", () => {
    expect(prefilter(email({ fromAddr: "recruiting@hh-careers.io" }), active).keep).toBe(true);
    expect(prefilter(email({ fromAddr: "x@sub.harbourhealth.com.au" }), active).keep).toBe(true);
  });

  it("keeps mail whose subject or body mentions an active company", () => {
    expect(prefilter(email({ subject: "Update from Northwind Analytics" }), active).keep).toBe(true);
    expect(prefilter(email({ bodyText: "Thanks for applying to Harbour Health!" }), active).keep).toBe(true);
  });

  it("keeps mail with recruiting keywords in the subject", () => {
    for (const k of SUBJECT_KEYWORDS) {
      expect(prefilter(email({ subject: `Re: ${k} — details` }), active).keep).toBe(true);
    }
    expect(prefilter(email({ subject: "Your Coding Challenge is ready" }), active).keep).toBe(true);
  });

  it("drops everything else (newsletters, unrelated senders)", () => {
    const r = prefilter(email({ fromAddr: "deals@shop.example", subject: "50% off this weekend", bodyText: "Buy now" }), active);
    expect(r.keep).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("does not match short/generic company tokens inside unrelated words", () => {
    // "the" is stripped; "kestrel" must match as a domain label, not any substring in the body
    expect(prefilter(email({ fromAddr: "news@thecompany.example", bodyText: "A kestrel is a bird." }), active).keep).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(prefilter(email({ fromAddr: "NoReply@LEVER.CO", subject: "APPLICATION RECEIVED" }), active).keep).toBe(true);
  });
});
