/**
 * Email classifier (SPEC §6.3 / §7). Haiku, temperature 0, JSON contract.
 * Output: application match, event type, confidence, one-line evidence.
 */
import { z } from "zod";
import { MODELS, callStructured, type ClaudeResult } from "../claude";
import type { Status } from "../stateMachine";

export const EMAIL_EVENTS = [
  "received_confirmation",
  "screening",
  "assessment_invite",
  "interview_invite",
  "offer",
  "rejected",
  "other",
] as const;
export type EmailEvent = (typeof EMAIL_EVENTS)[number];

export const classificationSchema = z.object({
  application_id: z.string().nullable(),
  event: z.enum(EMAIL_EVENTS),
  confidence: z.number(),
  evidence: z.string(),
  reasoning: z.string(),
});
export type Classification = z.infer<typeof classificationSchema>;

/** Status implied by an event; null = link only, no status change. */
export function eventToStatus(event: EmailEvent): Status | null {
  switch (event) {
    case "screening":
      return "screening";
    case "assessment_invite":
      return "assessment";
    case "interview_invite":
      return "interview";
    case "offer":
      return "offer";
    case "rejected":
      return "rejected";
    default:
      return null;
  }
}

export type ClassifierApplication = {
  id: string;
  company: string;
  roleTitle: string;
  status: Status;
  appliedAt: string;
};

export type ClassifierEmail = { fromAddr: string; subject: string; receivedAt: string; bodyText: string };

/** A past user decision, replayed as a few-shot example. */
export type CorrectionExample = {
  fromAddr: string;
  subject: string;
  snippet: string;
  applicationId: string | null;
  applicationLabel: string | null;
  event: EmailEvent;
};

const SYSTEM = `You classify inbound emails for a personal job-application tracker.

You receive one email and the list of the user's ACTIVE applications (id, company, role, status, applied date). Decide:
- application_id: the id of the application this email is about, or null. Never guess — null if unsure. Match on company/role names, sender domain, ATS references, or the role title. A recruiter marketing message, job alert, or newsletter is not about a specific application.
- event:
  received_confirmation — "we received your application" (confirms it was submitted; no status change),
  screening — recruiter wants an intro/phone screen or asks screening questions,
  assessment_invite — take-home, coding challenge, online test, HackerRank/Codility link,
  interview_invite — scheduling or confirming an interview (any round),
  offer — a job offer or offer details,
  rejected — the application is declined (including polite/vague "moving forward with other candidates"),
  other — anything else (job alerts, recruiter marketing, newsletters, calendar noise, unrelated mail).
- confidence: 0..1 that BOTH the application match and the event are right. Use ≥ 0.9 only for unambiguous cases; use ≤ 0.5 when the application cannot be identified.
- evidence: a short verbatim quote (≤ 20 words) from the email that supports the event.
- reasoning: one sentence.

Job alerts, digests and recruiter cold outreach are event "other" with application_id null.`;

function fmtApp(a: ClassifierApplication): string {
  return `${a.id} | ${a.company} | ${a.roleTitle} | status=${a.status} | applied=${a.appliedAt.slice(0, 10)}`;
}

function fmtExample(c: CorrectionExample): string {
  return [
    `From: ${c.fromAddr}`,
    `Subject: ${c.subject}`,
    `Body: ${c.snippet}`,
    `→ ${JSON.stringify({ application_id: c.applicationId, application: c.applicationLabel, event: c.event })}`,
  ].join("\n");
}

export async function classifyEmail(
  email: ClassifierEmail,
  activeApps: ClassifierApplication[],
  corrections: CorrectionExample[] = [],
): Promise<ClaudeResult<Classification>> {
  const parts: string[] = [];
  if (corrections.length) {
    parts.push("Past decisions by the user (treat these as ground truth for similar emails):", ...corrections.map(fmtExample), "");
  }
  parts.push(
    "Active applications:",
    activeApps.length ? activeApps.map(fmtApp).join("\n") : "(none)",
    "",
    "Email:",
    `From: ${email.fromAddr}`,
    `Subject: ${email.subject}`,
    `Received: ${email.receivedAt}`,
    "Body:",
    email.bodyText.slice(0, 6000),
  );
  const result = await callStructured({
    model: MODELS.fast,
    system: SYSTEM,
    user: parts.join("\n"),
    schema: classificationSchema,
    maxTokens: 600,
    temperature: 0,
    mock: () => mockClassify(email, activeApps),
  });
  if (!result.ok) return result;
  const c = result.data;
  const knownIds = new Set(activeApps.map((a) => a.id));
  return {
    ok: true,
    usage: result.usage,
    data: {
      ...c,
      application_id: c.application_id && knownIds.has(c.application_id) ? c.application_id : null,
      confidence: Math.max(0, Math.min(1, c.confidence)),
    },
  };
}

/** Keyword stand-in for JOBPILOT_MOCK_AI=1. */
export function mockClassify(email: ClassifierEmail, activeApps: ClassifierApplication[]): Classification {
  const text = `${email.subject}\n${email.bodyText}`.toLowerCase();
  const from = email.fromAddr.toLowerCase();
  const app = activeApps.find((a) => {
    const c = a.company.toLowerCase();
    const first = c.split(/\s+/)[0];
    return text.includes(c) || (first.length >= 4 && (text.includes(first) || from.includes(first)));
  });
  let event: EmailEvent = "other";
  if (/unfortunately|regret|not (be )?moving forward|other candidates|not selected|decided not to/.test(text)) event = "rejected";
  else if (/\boffer\b/.test(text) && !/job alert|newsletter/.test(text)) event = "offer";
  else if (/interview/.test(text)) event = "interview_invite";
  else if (/assessment|coding challenge|take-home|hackerrank|codility|online test/.test(text)) event = "assessment_invite";
  else if (/phone screen|intro call|screening|quick chat/.test(text)) event = "screening";
  else if (/received your application|thank you for applying|application (has been )?received|we have received/.test(text)) event = "received_confirmation";
  if (/job alert|new jobs for you|newsletter|unsubscribe from these alerts/.test(text)) event = "other";
  const confidence = event === "other" ? (app ? 0.4 : 0.92) : app ? 0.93 : 0.45;
  return {
    application_id: app?.id ?? null,
    event,
    confidence,
    evidence: email.subject.slice(0, 80),
    reasoning: "mock keyword classification",
  };
}
