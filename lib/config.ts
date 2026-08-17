/**
 * Runtime configuration (SPEC §10). Read from .env with sane defaults so the
 * tracker works with zero configuration; API keys are only required by the
 * features that use them (checked at call time, not at boot).
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    console.warn(`[config] ${name}="${raw}" is not a number; using ${fallback}`);
    return fallback;
  }
  return parsed;
}

export const config = {
  get anthropicApiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY || undefined;
  },
  get googleCredentialsPath(): string {
    return process.env.GOOGLE_CREDENTIALS_PATH || "secrets/credentials.json";
  },
  get googleTokenPath(): string {
    return process.env.GOOGLE_TOKEN_PATH || "secrets/token.json";
  },
  get pollMinutes(): number {
    return num("POLL_MINUTES", 15);
  },
  get autoApplyConfidence(): number {
    return num("AUTO_APPLY_CONFIDENCE", 0.85);
  },
  get planThreshold(): number {
    return num("PLAN_THRESHOLD", 60);
  },
  get ghostDays(): number {
    return num("GHOST_DAYS", 21);
  },
} as const;
