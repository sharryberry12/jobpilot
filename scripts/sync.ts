/**
 * `npm run sync` — one-shot CLI wrapper around lib/sync.ts (SPEC §2).
 *   npm run sync                 full cycle against your Gmail inbox
 *   npm run sync -- --fixtures   run the pipeline over fixtures/emails/*.json instead
 *                                (use JOBPILOT_MOCK_AI=1 to avoid API calls; add --prefix=x to re-ingest)
 */
import { closeDb, getDb } from "../lib/db";
import { fixtureSource } from "../lib/fixtures";
import { runSync } from "../lib/sync";

async function main() {
  getDb();
  const useFixtures = process.argv.includes("--fixtures");
  const prefixArg = process.argv.find((a) => a.startsWith("--prefix="));
  const prefix = prefixArg ? prefixArg.slice("--prefix=".length) : "";
  const summary = await runSync({ trigger: "cli", source: useFixtures ? fixtureSource(prefix) : undefined });
  console.log(JSON.stringify(summary, null, 2));
  closeDb();
  if (summary.errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
