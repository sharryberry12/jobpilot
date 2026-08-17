/**
 * Runtime settings: .env supplies defaults (SPEC §10); the Settings page can
 * override them at runtime. Overrides live in the kv table so they survive
 * restarts and need no redeploy.
 */
import { z } from "zod";
import { config } from "./config";
import { getKv, setKv } from "./emails";

export const SETTINGS_KEY = "settings_overrides";

export const settingsSchema = z.object({
  pollMinutes: z.number().int().min(1).max(1440),
  autoApplyConfidence: z.number().min(0).max(1),
  planThreshold: z.number().int().min(0).max(100),
  ghostDays: z.number().int().min(1).max(365),
  /** Extra sender domains treated like ATS domains (comma/space separated in the UI). */
  extraAtsDomains: z.array(z.string()),
  /** ntfy.sh topic (or full URL) for push notifications; empty = disabled. */
  ntfyTopic: z.string(),
  /** Hour of day (0-23, local time) for the daily digest; -1 disables it. */
  digestHour: z.number().int().min(-1).max(23),
});
export type Settings = z.infer<typeof settingsSchema>;

export function defaultSettings(): Settings {
  return {
    pollMinutes: config.pollMinutes,
    autoApplyConfidence: config.autoApplyConfidence,
    planThreshold: config.planThreshold,
    ghostDays: config.ghostDays,
    extraAtsDomains: [],
    ntfyTopic: process.env.NTFY_TOPIC ?? "",
    digestHour: Number.isFinite(Number(process.env.DIGEST_HOUR)) && process.env.DIGEST_HOUR !== undefined ? Number(process.env.DIGEST_HOUR) : 8,
  };
}

/** Effective settings = env defaults overridden by whatever the Settings page saved. */
export function getSettings(): Settings {
  const base = defaultSettings();
  const raw = getKv(SETTINGS_KEY);
  if (!raw) return base;
  try {
    const parsed = settingsSchema.partial().safeParse(JSON.parse(raw));
    return parsed.success ? { ...base, ...parsed.data } : base;
  } catch {
    return base;
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const merged = settingsSchema.parse({ ...getSettings(), ...patch });
  setKv(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}

export function resetSettings(): Settings {
  setKv(SETTINGS_KEY, "{}");
  return getSettings();
}
