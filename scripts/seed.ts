/**
 * `npm run seed` — creates 5 sample applications with a spread of statuses so
 * the board has something to show. Safe to re-run: it only adds rows whose
 * company+role are not already present.
 */
import { and, eq } from "drizzle-orm";
import { createApplication, transitionApplication } from "../lib/applications";
import { closeDb, getDb } from "../lib/db";
import { applications, statusEvents } from "../lib/db/schema";
import type { Status } from "../lib/stateMachine";

type Seed = {
  company: string;
  roleTitle: string;
  location: string;
  sourceUrl: string;
  companyDomains?: string;
  appliedDaysAgo: number;
  path: Status[]; // statuses after "applied", applied in order
  jdText: string;
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const SEEDS: Seed[] = [
  {
    company: "Northwind Analytics",
    roleTitle: "Frontend Engineer",
    location: "Remote (AU)",
    sourceUrl: "https://boards.greenhouse.io/northwind/jobs/101",
    companyDomains: "northwind.example",
    appliedDaysAgo: 18,
    path: ["screening", "interview"],
    jdText: `About the role
We're hiring a Frontend Engineer to own our customer-facing dashboard.

Must have
- 3+ years building production React applications with TypeScript
- Solid CSS fundamentals; experience with Tailwind or a comparable utility framework
- Experience consuming REST or GraphQL APIs
- Automated testing (Jest/Vitest, Testing Library, Playwright or Cypress)

Nice to have
- Next.js App Router, React Server Components
- Data visualisation (D3, Recharts, visx)
- Accessibility (WCAG 2.2) experience
- Design-system work with a component library`,
  },
  {
    company: "Harbour Health",
    roleTitle: "Full-Stack Developer",
    location: "Sydney, hybrid",
    sourceUrl: "https://jobs.lever.co/harbourhealth/202",
    appliedDaysAgo: 30,
    path: ["screening", "assessment", "interview", "interview", "offer"],
    jdText: `Harbour Health builds scheduling software for allied-health clinics.

Requirements
- TypeScript across the stack (Node.js + React)
- PostgreSQL schema design and query optimisation
- Building and securing REST APIs (auth, rate limiting, input validation)
- CI/CD (GitHub Actions) and containerised deployments (Docker)

Bonus points
- Healthcare data privacy experience
- Next.js
- AWS (ECS, RDS)`,
  },
  {
    company: "Kestrel Robotics",
    roleTitle: "Software Engineer, Platform",
    location: "Melbourne",
    sourceUrl: "https://kestrel.example/careers/303",
    appliedDaysAgo: 40,
    path: ["rejected"],
    jdText: `We build fleet-management software for warehouse robots.

You will need
- Go or Rust in production
- Kubernetes and Helm
- gRPC / protobuf service design
- Observability: Prometheus, Grafana, OpenTelemetry

Nice to have
- Python for tooling
- Experience with message brokers (Kafka, NATS)`,
  },
  {
    company: "Bluegum Bank",
    roleTitle: "Software Engineer (Graduate / Junior)",
    location: "Brisbane",
    sourceUrl: "https://bluegum.myworkday.com/careers/404",
    appliedDaysAgo: 5,
    path: [],
    jdText: `Join our 12-month rotation program across payments, lending and digital.

What we look for
- A degree in computer science, software engineering or similar (or equivalent experience)
- Programming fundamentals in Java, Python, JavaScript or C#
- Understanding of SQL and relational databases
- Clear written communication

Desirable
- Git and pull-request workflows
- Any cloud exposure (AWS/Azure/GCP)
- Agile team experience`,
  },
  {
    company: "Sundial Media",
    roleTitle: "React Developer (Contract)",
    location: "Remote",
    sourceUrl: "https://www.seek.com.au/job/505",
    appliedDaysAgo: 26,
    path: ["assessment"],
    jdText: `6-month contract to rebuild our editorial CMS front-end.

Essential
- React with hooks and TypeScript
- State management (Redux Toolkit, Zustand or similar)
- Working with headless CMS APIs
- Unit and integration testing

Desirable
- Next.js
- Storybook
- Performance profiling (Lighthouse, Web Vitals)`,
  },
];

function alreadySeeded(company: string, roleTitle: string): boolean {
  const db = getDb();
  return !!db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.company, company), eq(applications.roleTitle, roleTitle)))
    .get();
}

function main() {
  const db = getDb();
  let created = 0;
  for (const seed of SEEDS) {
    if (alreadySeeded(seed.company, seed.roleTitle)) {
      console.log(`[seed] skip ${seed.company} — ${seed.roleTitle} (exists)`);
      continue;
    }
    const app = createApplication(
      {
        company: seed.company,
        roleTitle: seed.roleTitle,
        jdText: seed.jdText,
        sourceUrl: seed.sourceUrl,
        location: seed.location,
        companyDomains: seed.companyDomains ?? null,
        appliedAt: daysAgo(seed.appliedDaysAgo),
      },
      db,
    );
    // Walk the status path, spacing events out over the elapsed days.
    const stepDays = seed.path.length ? seed.appliedDaysAgo / (seed.path.length + 1) : 0;
    seed.path.forEach((to, i) => {
      const result = transitionApplication(app.id, to, i % 2 === 0 ? "email" : "manual", {}, db);
      if (!result.ok) throw new Error(`seed transition failed: ${result.reason}`);
      // Back-date the event so the timeline reads naturally.
      const when = daysAgo(seed.appliedDaysAgo - stepDays * (i + 1));
      db.update(statusEvents).set({ createdAt: when }).where(eq(statusEvents.id, result.event.id)).run();
      db.update(applications).set({ updatedAt: when }).where(eq(applications.id, app.id)).run();
    });
    created += 1;
    console.log(`[seed] created ${seed.company} — ${seed.roleTitle} → ${seed.path.at(-1) ?? "applied"}`);
  }
  console.log(`[seed] done: ${created} created, ${SEEDS.length - created} skipped`);
  closeDb();
}

main();
