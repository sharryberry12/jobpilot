"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendPush } from "@/lib/notify";
import { resetSettings, saveSettings, type Settings } from "@/lib/settings";
import { fieldErrors, formDataToObject } from "@/lib/validation";

export type SettingsFormState = { ok?: boolean; errors?: Record<string, string>; saved?: Settings } | null;

const formSchema = z.object({
  pollMinutes: z.coerce.number().int().min(1, "At least 1 minute").max(1440),
  autoApplyConfidence: z.coerce.number().min(0).max(1, "0 to 1"),
  planThreshold: z.coerce.number().int().min(0).max(100),
  ghostDays: z.coerce.number().int().min(1).max(365),
  extraAtsDomains: z
    .string()
    .optional()
    .transform((v) => (v ?? "").split(/[,\s]+/).map((d) => d.trim().toLowerCase()).filter(Boolean))
    .refine((list) => list.every((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)), "Domains only, e.g. jobs.example.com"),
  ntfyTopic: z.string().trim().max(200).optional().transform((v) => v ?? ""),
  digestHour: z.coerce.number().int().min(-1).max(23),
});

export async function saveSettingsAction(_prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const parsed = formSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  try {
    const saved = saveSettings(parsed.data);
    revalidatePath("/settings");
    revalidatePath("/");
    return { ok: true, saved };
  } catch (err) {
    console.error("[saveSettings]", err);
    return { ok: false, errors: { _form: err instanceof Error ? err.message : "Could not save settings" } };
  }
}

export async function resetSettingsAction(): Promise<{ ok: true }> {
  resetSettings();
  revalidatePath("/settings");
  return { ok: true };
}

export async function testPushAction(): Promise<{ ok: boolean; error?: string }> {
  const sent = await sendPush("JobPilot test", "Push notifications are working.", { tags: ["white_check_mark"] });
  return sent ? { ok: true } : { ok: false, error: "No topic configured, or ntfy could not be reached (see server log)." };
}
