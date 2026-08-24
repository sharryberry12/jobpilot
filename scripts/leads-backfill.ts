/**
 * `npm run leads:backfill` — scan every stored email for LinkedIn job cards and
 * upsert them as leads (/leads). Deterministic and idempotent: safe to re-run.
 * New mail is harvested automatically by each sync; this covers mail that was
 * synced before the leads feature existed.
 */
import { closeDb, getDb } from "../lib/db";
import { backfillLeads, countLeadsByStatus } from "../lib/leads";

function main() {
  const db = getDb();
  const s = backfillLeads(db);
  const counts = countLeadsByStatus(db);
  console.log(
    `scanned ${s.emailsScanned} digest email(s) · ${s.found} job card(s) · ${s.inserted} new lead(s)\n` +
      `leads now: ${counts.new} new · ${counts.dismissed} dismissed · ${counts.applied} applied`,
  );
}

try {
  main();
} catch (err) {
  console.error("leads:backfill failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  closeDb();
}
