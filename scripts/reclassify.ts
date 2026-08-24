/**
 * `npm run reclassify` — re-run the classifier over review-queue rows that were
 * queued only because classification failed (e.g. the 60-day backfill ran before
 * ANTHROPIC_API_KEY existed). Prints one line per email and a summary.
 *   npm run reclassify -- --limit=20     cap this run (useful for a first look)
 */
import { closeDb, getDb } from "../lib/db";
import { hasApiKey } from "../lib/claude";
import { reclassifyFallbacks } from "../lib/sync";

async function main() {
  getDb();
  if (!hasApiKey()) {
    console.error("ANTHROPIC_API_KEY is not set (or JOBPILOT_MOCK_AI=1). Add it to .env and re-run.");
    process.exit(1);
  }
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : undefined;
  if (limitArg && (!Number.isFinite(limit) || (limit as number) <= 0)) {
    console.error(`Bad --limit value: ${limitArg}`);
    process.exit(1);
  }

  const started = Date.now();
  const s = await reclassifyFallbacks({ limit, onItem: (line) => console.log(line) });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log("-".repeat(80));
  console.log(
    `scanned ${s.scanned} · reclassified ${s.reclassified} (auto ${s.auto} / linked ${s.linked} / noise ${s.noise} / still queued ${s.queued}) · failed ${s.failed} · ${secs}s`,
  );
  if (s.errors.length) {
    console.log("errors:");
    for (const e of s.errors) console.log("  " + e);
  }
  if (s.scanned === 0) console.log("Nothing to do — no classifier-fallback rows in the review queue.");
}

main()
  .catch((err) => {
    console.error("reclassify failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
