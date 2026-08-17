/**
 * `npm run eval:classifier` — run every fixture through prefilter + classifier
 * (SPEC §11) and print expected vs got plus overall accuracy. Run after any
 * prompt change. Uses the API unless JOBPILOT_MOCK_AI=1.
 */
import { classifyEmail } from "../lib/ai/classify";
import { fixtureToEmail, loadEmailFixtures, loadFixtureApplications } from "../lib/fixtures";
import { prefilter } from "../lib/prefilter";

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));

async function main() {
  const fixtures = loadEmailFixtures();
  const apps = loadFixtureApplications();
  const byCompany = new Map(apps.map((a) => [a.company, a.id]));
  const prefilterApps = apps.map((a) => ({ id: a.id, company: a.company, companyDomains: a.companyDomains ?? null }));

  let prefilterOk = 0;
  let classified = 0;
  let appOk = 0;
  let eventOk = 0;
  let bothOk = 0;

  console.log(pad("fixture", 34) + pad("prefilter", 12) + pad("exp app/event", 32) + pad("got app/event", 32) + "conf  ok");
  console.log("-".repeat(120));

  for (const fx of fixtures) {
    const email = fixtureToEmail(fx);
    const pf = prefilter(email, prefilterApps);
    const pfOk = pf.keep === fx.expected.prefilter;
    if (pfOk) prefilterOk += 1;
    const expApp = fx.expected.application ? byCompany.get(fx.expected.application) ?? "?" : "null";
    let gotCol = "(dropped)";
    let conf = "";
    let mark = pfOk ? "✓" : "✗ prefilter";
    if (pf.keep) {
      classified += 1;
      const r = await classifyEmail(email, apps.map((a) => ({ id: a.id, company: a.company, roleTitle: a.roleTitle, status: a.status, appliedAt: a.appliedAt })));
      if (!r.ok) {
        gotCol = `ERROR ${r.code}`;
        mark = "✗ " + r.error.slice(0, 40);
      } else {
        const gotApp = r.data.application_id ?? "null";
        const aOk = gotApp === expApp;
        const eOk = r.data.event === fx.expected.event;
        if (aOk) appOk += 1;
        if (eOk) eventOk += 1;
        if (aOk && eOk) bothOk += 1;
        gotCol = `${gotApp}/${r.data.event}`;
        conf = r.data.confidence.toFixed(2);
        mark = aOk && eOk ? "✓" : `✗ ${!aOk ? "app " : ""}${!eOk ? "event" : ""}`;
      }
    }
    console.log(pad(fx.id.replace(/^fx_/, ""), 34) + pad(`${pf.keep ? "keep" : "drop"}${pfOk ? "" : " (exp " + (fx.expected.prefilter ? "keep" : "drop") + ")"}`, 12) + pad(`${expApp}/${fx.expected.event}`, 32) + pad(gotCol, 32) + pad(conf, 6) + mark);
  }

  console.log("-".repeat(120));
  console.log(`prefilter accuracy: ${prefilterOk}/${fixtures.length}`);
  if (classified) {
    console.log(`classifier (on ${classified} kept): application ${appOk}/${classified}, event ${eventOk}/${classified}, both ${bothOk}/${classified} (${Math.round((100 * bothOk) / classified)}%)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
