/**
 * Anthropic client + the one structured-output helper every AI feature uses.
 * SPEC §1.5 / §7: every call has a JSON contract, is parsed defensively and
 * degrades gracefully — callers get a typed ClaudeResult, never a throw.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { config } from "./config";

/**
 * Model roles (SPEC §2). Haiku 4.5 for classification/extraction; the spec
 * named claude-sonnet-4-6 for tailoring/plans and asked to check for newer
 * names at build time — claude-sonnet-5 is its successor. Override via env.
 */
export const MODELS = {
  get fast(): string {
    return process.env.CLAUDE_FAST_MODEL || "claude-haiku-4-5";
  },
  get smart(): string {
    return process.env.CLAUDE_SMART_MODEL || "claude-sonnet-5";
  },
} as const;

export type ClaudeErrorCode =
  | "missing_api_key"
  | "refusal"
  | "truncated"
  | "invalid_json"
  | "schema_mismatch"
  | "rate_limited"
  | "api_error";

export type ClaudeUsage = { inputTokens: number; outputTokens: number; model: string };

export type ClaudeResult<T> =
  | { ok: true; data: T; usage: ClaudeUsage }
  | { ok: false; code: ClaudeErrorCode; error: string };

let client: Anthropic | null = null;

/** True when AI features can run: a real key, or mock mode for offline development. */
export function hasApiKey(): boolean {
  return Boolean(config.anthropicApiKey) || isMockMode();
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 2 });
  return client;
}

export type StructuredCallOptions<S extends z.ZodType> = {
  model: string;
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
  /** Only for models that accept sampling params (Haiku 4.5). */
  temperature?: number;
  effort?: "low" | "medium" | "high";
  /**
   * Deterministic stand-in used when JOBPILOT_MOCK_AI=1 (no API key needed).
   * Lets the UI and eval scripts run offline; never used otherwise.
   */
  mock?: () => z.infer<S>;
};

export function isMockMode(): boolean {
  return process.env.JOBPILOT_MOCK_AI === "1";
}

/** Strip ```json fences and parse. Used only if the SDK's own parse yields nothing. */
export function parseJsonLoose(text: string): unknown {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
    throw new Error("no JSON object found");
  }
}

export async function callStructured<S extends z.ZodType>(
  opts: StructuredCallOptions<S>,
): Promise<ClaudeResult<z.infer<S>>> {
  if (isMockMode() && opts.mock) {
    const parsed = opts.schema.safeParse(opts.mock());
    if (parsed.success) {
      return { ok: true, data: parsed.data as z.infer<S>, usage: { inputTokens: 0, outputTokens: 0, model: "mock" } };
    }
    return { ok: false, code: "schema_mismatch", error: `Mock output invalid: ${parsed.error.message.slice(0, 200)}` };
  }
  if (!hasApiKey()) {
    return { ok: false, code: "missing_api_key", error: "ANTHROPIC_API_KEY is not set (.env)" };
  }
  try {
    const response = await getClient().messages.parse({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8192,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      output_config: {
        format: zodOutputFormat(opts.schema),
        ...(opts.effort ? { effort: opts.effort } : {}),
      },
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    });

    const usage: ClaudeUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
    };

    if (response.stop_reason === "refusal") {
      return { ok: false, code: "refusal", error: "The model declined this request." };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, code: "truncated", error: "Response was cut off (max_tokens). Try again or shorten the input." };
    }

    if (response.parsed_output !== null && response.parsed_output !== undefined) {
      return { ok: true, data: response.parsed_output as z.infer<S>, usage };
    }

    // Defensive fallback: pull text, strip fences, validate against the schema.
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    let raw: unknown;
    try {
      raw = parseJsonLoose(text);
    } catch (err) {
      return { ok: false, code: "invalid_json", error: `Model returned non-JSON output: ${(err as Error).message}` };
    }
    const parsed = opts.schema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, code: "schema_mismatch", error: `Model output did not match the expected shape: ${parsed.error.message.slice(0, 300)}` };
    }
    return { ok: true, data: parsed.data as z.infer<S>, usage };
  } catch (err) {
    return { ok: false, ...describeApiError(err) };
  }
}

function describeApiError(err: unknown): { code: ClaudeErrorCode; error: string } {
  if (err instanceof Anthropic.AuthenticationError) {
    return { code: "api_error", error: "Anthropic rejected the API key (401). Check ANTHROPIC_API_KEY." };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { code: "rate_limited", error: "Anthropic rate limit hit (429). Try again shortly." };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { code: "api_error", error: `Could not reach the Anthropic API: ${err.message}` };
  }
  if (err instanceof Anthropic.APIError) {
    return { code: "api_error", error: `Anthropic API error ${err.status ?? ""}: ${err.message}` };
  }
  return { code: "api_error", error: err instanceof Error ? err.message : String(err) };
}
