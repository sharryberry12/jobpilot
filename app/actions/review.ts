"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EMAIL_EVENTS, eventToStatus, type EmailEvent } from "@/lib/ai/classify";
import { getApplication, transitionApplication } from "@/lib/applications";
import { getReviewItem, resolveReview, setEmailDecision } from "@/lib/emails";
import { canTransition } from "@/lib/stateMachine";
import { idSchema } from "@/lib/validation";

type Result = { ok: true; message: string } | { ok: false; error: string };

const eventSchema = z.enum(EMAIL_EVENTS);

/**
 * Apply a (possibly corrected) decision: link the email and, if the event
 * implies a status change the state machine allows from the current status,
 * write a status_event with source=email. Refused moves are reported, not forced.
 */
function applyDecision(
  emailId: string,
  applicationId: string | null,
  event: EmailEvent,
  confidence: number | null,
): Result {
  if (!applicationId) {
    setEmailDecision(emailId, { applicationId: null, eventType: event, confidence, decidedBy: "user" });
    return { ok: true, message: "Marked as not related to an application." };
  }
  const app = getApplication(applicationId);
  if (!app) return { ok: false, error: "That application no longer exists." };
  const implied = eventToStatus(event);
  if (implied === null || (implied === app.status && implied !== "interview")) {
    setEmailDecision(emailId, { applicationId, eventType: event, confidence, decidedBy: "user" });
    return { ok: true, message: `Linked to ${app.company} (no status change).` };
  }
  const verdict = canTransition(app.status, implied, "email");
  if (!verdict.ok) {
    return { ok: false, error: `Can't move ${app.company} from ${app.status} to ${implied}: ${verdict.reason} Change the status manually on the application page if that is what happened.` };
  }
  const moved = transitionApplication(applicationId, implied, "email", { emailId, note: "Confirmed from review queue" });
  if (!moved.ok) return { ok: false, error: moved.reason };
  setEmailDecision(emailId, { applicationId, eventType: event, confidence, decidedBy: "user" });
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true, message: `${app.company} moved to ${implied}.` };
}

function finish(): void {
  revalidatePath("/review");
  revalidatePath("/");
}

export async function acceptReviewAction(itemId: string): Promise<Result> {
  const id = idSchema.safeParse(itemId);
  if (!id.success) return { ok: false, error: "Invalid item" };
  const item = getReviewItem(id.data);
  if (!item || item.status !== "pending") return { ok: false, error: "Item not found or already resolved." };
  const event = eventSchema.safeParse(item.proposedEvent);
  if (!event.success) return { ok: false, error: "The proposed event is not valid — use Correct instead." };
  const result = applyDecision(item.emailId, item.proposedApplicationId, event.data, item.confidence);
  if (!result.ok) return result;
  resolveReview(item.id, { status: "accepted" });
  finish();
  return result;
}

export async function correctReviewAction(itemId: string, applicationId: string | null, event: string): Promise<Result> {
  const id = idSchema.safeParse(itemId);
  const ev = eventSchema.safeParse(event);
  const appId = applicationId ? idSchema.safeParse(applicationId) : null;
  if (!id.success) return { ok: false, error: "Invalid item" };
  if (!ev.success) return { ok: false, error: "Pick a valid event" };
  if (appId && !appId.success) return { ok: false, error: "Invalid application" };
  const item = getReviewItem(id.data);
  if (!item || item.status !== "pending") return { ok: false, error: "Item not found or already resolved." };
  const result = applyDecision(item.emailId, appId?.data ?? null, ev.data, item.confidence);
  if (!result.ok) return result;
  resolveReview(item.id, { status: "corrected", correctedApplicationId: appId?.data ?? null, correctedEvent: ev.data });
  finish();
  return { ok: true, message: `Correction saved. ${result.message}` };
}

export async function dismissReviewAction(itemId: string): Promise<Result> {
  const id = idSchema.safeParse(itemId);
  if (!id.success) return { ok: false, error: "Invalid item" };
  const item = getReviewItem(id.data);
  if (!item || item.status !== "pending") return { ok: false, error: "Item not found or already resolved." };
  setEmailDecision(item.emailId, { applicationId: null, eventType: "other", confidence: item.confidence, decidedBy: "dismissed" });
  resolveReview(item.id, { status: "dismissed" });
  finish();
  return { ok: true, message: "Dismissed." };
}
