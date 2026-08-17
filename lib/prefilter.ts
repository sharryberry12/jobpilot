/**
 * Cheap, no-LLM email prefilter (SPEC §6.3). Keep an email if ANY of:
 *  - sender domain is (a subdomain of) a known ATS domain,
 *  - sender domain matches a company domain of an active application
 *    (derived from the company name, plus the company_domains override),
 *  - subject/body contains an active company name,
 *  - subject matches a recruiting keyword.
 * Everything else is ignored and never stored.
 */

export const ATS_DOMAINS: readonly string[] = [
  "greenhouse.io",
  "lever.co",
  "myworkday.com",
  "workday.com",
  "ashbyhq.com",
  "smartrecruiters.com",
  "icims.com",
  "jobvite.com",
  "bamboohr.com",
  "taleo.net",
  "successfactors.com",
  "seek.com.au",
  "indeed.com",
  "linkedin.com",
];

export const SUBJECT_KEYWORDS: readonly string[] = [
  "application",
  "interview",
  "assessment",
  "offer",
  "unfortunately",
  "next steps",
  "coding challenge",
  "your candidacy",
];

const LEGAL_SUFFIXES = new Set([
  "the", "inc", "inc.", "ltd", "ltd.", "pty", "pty.", "llc", "plc", "co", "co.", "corp", "corp.",
  "corporation", "company", "limited", "gmbh", "ag", "sa", "bv", "group", "holdings", "technologies", "labs",
]);

export type PrefilterEmail = { fromAddr: string; subject: string; bodyText: string };
export type PrefilterApplication = { id: string; company: string; companyDomains: string | null };
export type PrefilterResult = { keep: boolean; reasons: string[] };

export function senderDomain(fromAddr: string): string {
  const m = fromAddr.match(/@([a-z0-9.-]+)/i);
  return m ? m[1].toLowerCase().replace(/[.>]+$/, "") : "";
}

function domainMatches(domain: string, candidate: string): boolean {
  return domain === candidate || domain.endsWith(`.${candidate}`);
}

/** Cleaned company words, without legal suffixes and articles. */
export function companyWords(company: string): string[] {
  return company
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w && !LEGAL_SUFFIXES.has(w));
}

/**
 * Domain-label candidates derived from a company name: the compact form of
 * all words ("harbourhealth") plus the first word when it is distinctive
 * (≥ 4 chars, "harbour").
 */
export function companyDomainCandidates(company: string): string[] {
  const words = companyWords(company);
  if (words.length === 0) return [];
  const compact = words.join("");
  const out = [compact];
  if (words.length > 1 && words[0].length >= 4 && words[0] !== compact) out.push(words[0]);
  return out;
}

function overrideDomains(app: PrefilterApplication): string[] {
  return (app.companyDomains ?? "")
    .split(/[,\s]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/** True if any label of the sender domain (minus TLDs) matches a company candidate. */
function domainMatchesCompany(domain: string, app: PrefilterApplication): boolean {
  if (!domain) return false;
  for (const d of overrideDomains(app)) if (domainMatches(domain, d)) return true;
  const candidates = companyDomainCandidates(app.company);
  if (candidates.length === 0) return false;
  const labels = domain.split(".").map((l) => l.replace(/[^a-z0-9]/g, ""));
  return labels.some((label) => label.length >= 4 && candidates.includes(label));
}

export type PrefilterOptions = { extraAtsDomains?: string[] };

export function prefilter(
  email: PrefilterEmail,
  activeApps: PrefilterApplication[],
  opts: PrefilterOptions = {},
): PrefilterResult {
  const reasons: string[] = [];
  const domain = senderDomain(email.fromAddr);
  const subject = email.subject.toLowerCase();
  const body = email.bodyText.toLowerCase();

  const atsList = [...ATS_DOMAINS, ...(opts.extraAtsDomains ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean)];
  const ats = atsList.find((d) => domainMatches(domain, d));
  if (ats) reasons.push(`ATS domain ${ats}`);

  for (const app of activeApps) {
    if (domainMatchesCompany(domain, app)) {
      reasons.push(`sender domain matches ${app.company}`);
      break;
    }
  }

  for (const app of activeApps) {
    const name = companyWords(app.company).join(" ");
    if (name.length >= 3 && (subject.includes(name) || body.includes(name))) {
      reasons.push(`mentions ${app.company}`);
      break;
    }
  }

  const kw = SUBJECT_KEYWORDS.find((k) => subject.includes(k));
  if (kw) reasons.push(`subject keyword "${kw}"`);

  return { keep: reasons.length > 0, reasons };
}
