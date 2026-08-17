"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createApplication,
  deleteApplication,
  transitionApplication,
  updateApplication,
} from "@/lib/applications";
import {
  applicationInputSchema,
  fieldErrors,
  formDataToObject,
  idSchema,
  statusSchema,
} from "@/lib/validation";
import type { Status } from "@/lib/stateMachine";

export type FormState = {
  errors?: Record<string, string>;
  values?: Record<string, string>;
} | null;

export async function createApplicationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = formDataToObject(formData);
  const parsed = applicationInputSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  let id: string;
  try {
    id = createApplication(parsed.data).id;
  } catch (err) {
    console.error("[createApplication]", err);
    return {
      errors: { _form: "Could not save the application. Check the server log." },
      values: raw,
    };
  }
  revalidatePath("/");
  redirect(`/applications/${id}`);
}

export async function updateApplicationAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) return { errors: { _form: "Invalid application id" } };
  const raw = formDataToObject(formData);
  const parsed = applicationInputSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  try {
    const updated = updateApplication(idParsed.data, parsed.data);
    if (!updated) return { errors: { _form: "Application not found" }, values: raw };
  } catch (err) {
    console.error("[updateApplication]", err);
    return { errors: { _form: "Could not save changes. Check the server log." }, values: raw };
  }
  revalidatePath("/");
  revalidatePath(`/applications/${idParsed.data}`);
  redirect(`/applications/${idParsed.data}`);
}

export async function deleteApplicationAction(
  id: string,
): Promise<{ ok: boolean; reason?: string }> {
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, reason: "Invalid application id" };
  try {
    const removed = deleteApplication(idParsed.data);
    if (!removed) return { ok: false, reason: "Application not found" };
  } catch (err) {
    console.error("[deleteApplication]", err);
    return { ok: false, reason: "Could not delete. Check the server log." };
  }
  revalidatePath("/");
  redirect("/");
}

export type MoveResult = { ok: true; status: Status } | { ok: false; reason: string };

/** Manual status change (kanban drag or detail-page menu). */
export async function moveApplicationAction(
  id: string,
  to: string,
  note?: string,
): Promise<MoveResult> {
  const idParsed = idSchema.safeParse(id);
  const toParsed = statusSchema.safeParse(to);
  if (!idParsed.success) return { ok: false, reason: "Invalid application id" };
  if (!toParsed.success) return { ok: false, reason: `Unknown status "${to}"` };

  try {
    const outcome = transitionApplication(idParsed.data, toParsed.data, "manual", {
      note: note?.trim() || null,
    });
    if (!outcome.ok) return { ok: false, reason: outcome.reason };
    revalidatePath("/");
    revalidatePath(`/applications/${idParsed.data}`);
    return { ok: true, status: outcome.application.status };
  } catch (err) {
    console.error("[moveApplication]", err);
    return { ok: false, reason: "Could not update status. Check the server log." };
  }
}
